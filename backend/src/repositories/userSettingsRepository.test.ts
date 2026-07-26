import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors the columns' `default` in migration 003 — used only to model what
// Postgres itself fills in on a first INSERT, the same way the real table
// would, so this test can tell "used the DB default" apart from "used a
// stale JS-side default that clobbered an existing row" (the actual bug
// this file's fix addresses).
const TABLE_DEFAULTS = {
  default_workspace_id: null,
  default_reminder_minutes: 30,
  week_starts_on: 1,
  daily_digest_enabled: false,
  daily_digest_time: "09:00",
  evening_digest_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  telegram_notifications_enabled: true,
  theme: "system",
};

const db = { settings: new Map<string, Record<string, unknown>>() };

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let lastWrittenKey: string | undefined;

    const matched = () => [...db.settings.values()].filter((row) => filters.every((f) => f(row)));

    const b = {
      select: () => b,
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      insert(values: Record<string, unknown>) {
        const key = values.user_id as string;
        db.settings.set(key, { ...values });
        lastWrittenKey = key;
        return b;
      },
      upsert(values: Record<string, unknown>) {
        const key = values.user_id as string;
        const existing = db.settings.get(key);
        // This is the real behavior being modeled: ON CONFLICT DO UPDATE
        // touches only the columns present in `values`; anything else on an
        // existing row is left as-is. A first insert gets the table's own
        // defaults for whatever `values` didn't specify.
        db.settings.set(key, existing ? { ...existing, ...values } : { ...TABLE_DEFAULTS, ...values });
        lastWrittenKey = key;
        return b;
      },
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      single: async () => ({ data: (lastWrittenKey && db.settings.get(lastWrittenKey)) ?? null, error: null }),
    };
    return b;
  }

  return { supabase: { from: () => builder() } };
});

const { createDefaultSettings, getSettingsOrDefaults, upsertSettings } = await import(
  "./userSettingsRepository.js"
);

beforeEach(() => {
  db.settings.clear();
});

describe("getSettingsOrDefaults", () => {
  it("returns table-shaped defaults when no row exists yet", async () => {
    const settings = await getSettingsOrDefaults("user-1");
    expect(settings.user_id).toBe("user-1");
    expect(settings.theme).toBe("system");
    expect(settings.default_reminder_minutes).toBe(30);
  });

  it("returns the stored row once one exists", async () => {
    await createDefaultSettings("user-1", "ws-1");
    const settings = await getSettingsOrDefaults("user-1");
    expect(settings.default_workspace_id).toBe("ws-1");
  });
});

describe("upsertSettings", () => {
  it("creates a row with table defaults plus the given fields on first write", async () => {
    const settings = await upsertSettings("user-1", { theme: "dark" });
    expect(settings.theme).toBe("dark");
    expect(settings.default_reminder_minutes).toBe(30); // untouched table default
  });

  it("regression: a later partial update does not reset earlier custom fields", async () => {
    // This is exactly the bug caught in review: upsertSettings used to spread
    // its own DEFAULTS object into every upsert call, so ON CONFLICT DO
    // UPDATE would overwrite every column the caller hadn't just set back to
    // default — silently discarding whatever the user had previously chosen.
    await upsertSettings("user-1", { theme: "dark", telegram_notifications_enabled: false });

    const afterFirst = await getSettingsOrDefaults("user-1");
    expect(afterFirst.theme).toBe("dark");
    expect(afterFirst.telegram_notifications_enabled).toBe(false);

    const afterSecond = await upsertSettings("user-1", { week_starts_on: 0 });

    expect(afterSecond.theme).toBe("dark"); // must survive, not reset to "system"
    expect(afterSecond.telegram_notifications_enabled).toBe(false); // must also survive
    expect(afterSecond.week_starts_on).toBe(0);
  });
});
