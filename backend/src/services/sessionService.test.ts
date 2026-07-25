import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory stand-in for the user_sessions table, exercising the rotation and
 * reuse-detection rules without a database.
 */
interface Row {
  id: string;
  user_id: string;
  token_hash: string;
  revoked_at: string | null;
  replaced_by: string | null;
  expires_at: string;
  user_agent: string | null;
}

const db = {
  sessions: [] as Row[],
  users: [{ id: "user-1", telegram_id: 42 }],
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

vi.mock("../lib/supabase.js", () => {
  function makeBuilder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" | "delete" = "select";
    let updates: Partial<Row> = {};

    const rows = () => (table === "user_sessions" ? db.sessions : (db.users as unknown as Row[]));
    const matched = () => rows().filter((row) => filters.every((f) => f(row)));

    const apply = () => {
      const hits = matched();
      if (mode === "update") {
        for (const row of hits) Object.assign(row, updates);
      } else if (mode === "delete") {
        for (const row of hits) {
          const i = rows().indexOf(row);
          if (i >= 0) rows().splice(i, 1);
        }
      }
      return hits;
    };

    const builder = {
      select: () => builder,
      insert(values: Partial<Row>) {
        const row: Row = {
          id: `s${db.sessions.length + 1}`,
          user_id: values.user_id as string,
          token_hash: values.token_hash as string,
          revoked_at: null,
          replaced_by: null,
          expires_at: values.expires_at as string,
          user_agent: values.user_agent ?? null,
        };
        db.sessions.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      },
      update(values: Partial<Row>) {
        mode = "update";
        updates = values;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      eq(column: keyof Row, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: keyof Row, value: null) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      gt(column: keyof Row, value: string) {
        filters.push((row) => String(row[column]) > value);
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      single: async () => ({ data: matched()[0] ?? null, error: null }),
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        resolve({ data: apply(), error: null });
      },
    };
    return builder;
  }

  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

const { createSession, rotateSession, revokeAllSessions, revokeSession } = await import(
  "./sessionService.js"
);

beforeEach(() => {
  db.sessions = [];
});

describe("createSession", () => {
  it("stores only a hash of the refresh token, never the token itself", async () => {
    const tokens = await createSession({ userId: "user-1", telegramId: 42 });

    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0]!.token_hash).toBe(sha256(tokens.refreshToken));
    expect(JSON.stringify(db.sessions)).not.toContain(tokens.refreshToken);
  });

  it("issues a usable access token and an expiry hint", async () => {
    const tokens = await createSession({ userId: "user-1", telegramId: 42 });
    expect(tokens.accessToken.split(".")).toHaveLength(3);
    expect(tokens.expiresIn).toBeGreaterThan(0);
  });

  it("generates a distinct token per session", async () => {
    const a = await createSession({ userId: "user-1", telegramId: 42 });
    const b = await createSession({ userId: "user-1", telegramId: 42 });
    expect(a.refreshToken).not.toBe(b.refreshToken);
  });
});

describe("rotateSession", () => {
  it("issues a new pair and retires the presented token", async () => {
    const first = await createSession({ userId: "user-1", telegramId: 42 });
    const second = await rotateSession({ refreshToken: first.refreshToken });

    expect(second.refreshToken).not.toBe(first.refreshToken);

    const oldRow = db.sessions.find((s) => s.token_hash === sha256(first.refreshToken));
    expect(oldRow?.revoked_at).not.toBeNull();
    expect(oldRow?.replaced_by).toBeTruthy();
  });

  it("rejects an unknown token", async () => {
    await expect(rotateSession({ refreshToken: "never-issued" })).rejects.toMatchObject({
      code: "SESSION_INVALID",
    });
  });

  it("revokes every session when an already-rotated token is replayed", async () => {
    const first = await createSession({ userId: "user-1", telegramId: 42 });
    await rotateSession({ refreshToken: first.refreshToken });

    // Replaying the retired token is treated as theft, not a retry.
    await expect(rotateSession({ refreshToken: first.refreshToken })).rejects.toMatchObject({
      code: "SESSION_REUSED",
    });

    expect(db.sessions.every((s) => s.revoked_at !== null)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const tokens = await createSession({ userId: "user-1", telegramId: 42 });
    db.sessions[0]!.expires_at = new Date(Date.now() - 1000).toISOString();

    await expect(rotateSession({ refreshToken: tokens.refreshToken })).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});

describe("revocation", () => {
  it("revokeSession invalidates only that token", async () => {
    const a = await createSession({ userId: "user-1", telegramId: 42 });
    const b = await createSession({ userId: "user-1", telegramId: 42 });

    await revokeSession(a.refreshToken);

    expect(db.sessions.find((s) => s.token_hash === sha256(a.refreshToken))?.revoked_at).not.toBeNull();
    expect(db.sessions.find((s) => s.token_hash === sha256(b.refreshToken))?.revoked_at).toBeNull();
  });

  it("revokeAllSessions logs the user out everywhere", async () => {
    await createSession({ userId: "user-1", telegramId: 42 });
    await createSession({ userId: "user-1", telegramId: 42 });

    await revokeAllSessions("user-1");

    expect(db.sessions.every((s) => s.revoked_at !== null)).toBe(true);
  });

  it("a revoked token cannot be refreshed", async () => {
    const tokens = await createSession({ userId: "user-1", telegramId: 42 });
    await revokeSession(tokens.refreshToken);

    await expect(rotateSession({ refreshToken: tokens.refreshToken })).rejects.toMatchObject({
      code: "SESSION_REUSED",
    });
  });
});
