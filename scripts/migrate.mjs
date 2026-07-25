#!/usr/bin/env node
// Applies pending SQL migrations from supabase/migrations in filename order.
//
//   node scripts/migrate.mjs           apply pending migrations
//   node scripts/migrate.mjs --status  list applied / pending, change nothing
//   node scripts/migrate.mjs --dry-run print what would run, change nothing
//
// Each migration runs inside a transaction and is recorded in
// schema_migrations, so re-running is safe and a failing migration leaves no
// half-applied state. Rollback scripts (*.down.sql) are never run by this
// tool — reverting is a deliberate, manual act.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

function loadEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => /^\s*[A-Z_][A-Z0-9_]*\s*=/.test(line))
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFile(path.join(ROOT, "backend", ".env"));
const DATABASE_URL = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Add it to backend/.env (git-ignored) or pass it in the environment.\n" +
      "Supabase: Project Settings -> Database -> Connection string -> URI.",
  );
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const dryRun = process.argv.includes("--dry-run");

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex").slice(0, 16);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  // Supabase requires TLS; its pooler presents a cert for a shared hostname,
  // so verification is relaxed here while the connection stays encrypted.
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
});

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query("select name, checksum from schema_migrations");
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));
  const files = migrationFiles();

  if (statusOnly) {
    console.log(`${files.length} migration(s) in ${path.relative(ROOT, MIGRATIONS_DIR)}:\n`);
    for (const name of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
      const previous = applied.get(name);
      if (!previous) console.log(`  PENDING  ${name}`);
      else if (previous !== checksum(sql)) console.log(`  CHANGED  ${name}  (already applied, file edited since)`);
      else console.log(`  applied  ${name}`);
    }
    process.exit(0);
  }

  const pending = files.filter((name) => !applied.has(name));

  // An edited migration that has already run will not be re-applied; flag it
  // rather than let the file and the database drift apart unnoticed.
  for (const name of files) {
    const previous = applied.get(name);
    if (!previous) continue;
    const current = checksum(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
    if (previous !== current) {
      console.warn(`WARNING: ${name} was already applied but its contents have changed since.`);
    }
  }

  if (pending.length === 0) {
    console.log("Nothing to apply — database is up to date.");
    process.exit(0);
  }

  console.log(`${pending.length} pending migration(s): ${pending.join(", ")}`);
  if (dryRun) {
    console.log("--dry-run: nothing was applied.");
    process.exit(0);
  }

  for (const name of pending) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
    process.stdout.write(`Applying ${name} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [
        name,
        checksum(sql),
      ]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(`\n${name} failed and was rolled back:\n${err.message}`);
      process.exit(1);
    }
  }

  console.log("\nAll migrations applied.");
} finally {
  await client.end();
}
