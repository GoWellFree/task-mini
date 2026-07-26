import { beforeEach, describe, expect, it, vi } from "vitest";

interface AssigneeRow {
  task_id: string;
  user_id: string;
}
interface UserRow {
  id: string;
  telegram_id: number;
}
interface SettingsRow {
  user_id: string;
  default_reminder_minutes: number;
  telegram_notifications_enabled: boolean;
}
interface ReminderRow {
  task_id: string;
  user_id: string;
  sent_at: string;
}

const db = {
  taskAssignees: [] as AssigneeRow[],
  users: [] as UserRow[],
  userSettings: [] as SettingsRow[],
  taskReminders: [] as ReminderRow[],
};

vi.mock("../lib/supabase.js", () => {
  function tableFor(name: string): Record<string, unknown>[] {
    switch (name) {
      case "task_assignees":
        return db.taskAssignees as unknown as Record<string, unknown>[];
      case "users":
        return db.users as unknown as Record<string, unknown>[];
      case "user_settings":
        return db.userSettings as unknown as Record<string, unknown>[];
      case "task_reminders":
        return db.taskReminders as unknown as Record<string, unknown>[];
      default:
        throw new Error(`unexpected table in mock: ${name}`);
    }
  }

  function builder(table: string) {
    const rows = tableFor(table);
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let mode: "select" | "delete" | "upsert" = "select";
    let upsertValues: Record<string, unknown> | null = null;

    const matched = () => rows.filter((row) => filters.every((f) => f(row)));

    const b = {
      select: () => b,
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return b;
      },
      delete() {
        mode = "delete";
        return b;
      },
      upsert(values: Record<string, unknown>) {
        mode = "upsert";
        upsertValues = values;
        return b;
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (mode === "delete") {
          for (const hit of matched()) {
            const idx = rows.indexOf(hit);
            if (idx >= 0) rows.splice(idx, 1);
          }
          resolve({ data: null, error: null });
          return;
        }
        if (mode === "upsert" && upsertValues) {
          const values = upsertValues;
          const existing = rows.find((row) => row.task_id === values.task_id && row.user_id === values.user_id);
          if (existing) Object.assign(existing, values);
          else rows.push({ sent_at: new Date().toISOString(), ...values });
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: matched(), error: null });
      },
    };
    return b;
  }

  return { supabase: { from: (table: string) => builder(table) } };
});

const { clearRemindersForTask, fetchRecipientInfo, listAlreadyReminded, listAssigneeIdsByTask, recordReminderSent } =
  await import("./reminderRepository.js");

beforeEach(() => {
  db.taskAssignees = [];
  db.users = [];
  db.userSettings = [];
  db.taskReminders = [];
});

describe("listAssigneeIdsByTask", () => {
  it("returns an empty map for an empty task id list", async () => {
    expect(await listAssigneeIdsByTask([])).toEqual(new Map());
  });

  it("groups multiple assignees under the same task", async () => {
    db.taskAssignees = [
      { task_id: "t1", user_id: "u1" },
      { task_id: "t1", user_id: "u2" },
      { task_id: "t2", user_id: "u3" },
    ];
    const result = await listAssigneeIdsByTask(["t1", "t2"]);
    expect(result.get("t1")?.slice().sort()).toEqual(["u1", "u2"]);
    expect(result.get("t2")).toEqual(["u3"]);
  });

  it("omits tasks that have no assignees at all, rather than mapping them to an empty array", async () => {
    db.taskAssignees = [{ task_id: "t1", user_id: "u1" }];
    const result = await listAssigneeIdsByTask(["t1", "t2"]);
    expect(result.has("t2")).toBe(false);
  });
});

describe("fetchRecipientInfo", () => {
  it("returns an empty map for an empty user id list", async () => {
    expect(await fetchRecipientInfo([])).toEqual(new Map());
  });

  it("uses a user's own settings when present", async () => {
    db.users = [{ id: "u1", telegram_id: 111 }];
    db.userSettings = [{ user_id: "u1", default_reminder_minutes: 15, telegram_notifications_enabled: false }];
    const result = await fetchRecipientInfo(["u1"]);
    expect(result.get("u1")).toEqual({ telegramId: 111, reminderMinutes: 15, notificationsEnabled: false });
  });

  it("falls back to the column defaults (30 min, enabled) when a user has no settings row yet", async () => {
    db.users = [{ id: "u1", telegram_id: 111 }];
    const result = await fetchRecipientInfo(["u1"]);
    expect(result.get("u1")).toEqual({ telegramId: 111, reminderMinutes: 30, notificationsEnabled: true });
  });

  it("looks up several users in one call, each with their own settings", async () => {
    db.users = [
      { id: "u1", telegram_id: 111 },
      { id: "u2", telegram_id: 222 },
    ];
    db.userSettings = [{ user_id: "u2", default_reminder_minutes: 60, telegram_notifications_enabled: true }];
    const result = await fetchRecipientInfo(["u1", "u2"]);
    expect(result.get("u1")?.reminderMinutes).toBe(30);
    expect(result.get("u2")?.reminderMinutes).toBe(60);
  });
});

describe("listAlreadyReminded", () => {
  it("returns an empty set for an empty task id list", async () => {
    expect(await listAlreadyReminded([])).toEqual(new Set());
  });

  it("builds composite task:user keys", async () => {
    db.taskReminders = [
      { task_id: "t1", user_id: "u1", sent_at: "2024-01-01T00:00:00Z" },
      { task_id: "t1", user_id: "u2", sent_at: "2024-01-01T00:00:00Z" },
    ];
    expect(await listAlreadyReminded(["t1"])).toEqual(new Set(["t1:u1", "t1:u2"]));
  });
});

describe("recordReminderSent / clearRemindersForTask", () => {
  it("records a sent reminder, then it shows up as already-reminded", async () => {
    await recordReminderSent("t1", "u1");
    expect(await listAlreadyReminded(["t1"])).toEqual(new Set(["t1:u1"]));
  });

  it("is idempotent — recording the same (task, user) pair twice keeps a single row", async () => {
    await recordReminderSent("t1", "u1");
    await recordReminderSent("t1", "u1");
    expect(db.taskReminders).toHaveLength(1);
  });

  it("clearRemindersForTask removes every reminder for that task, leaving other tasks' reminders intact", async () => {
    await recordReminderSent("t1", "u1");
    await recordReminderSent("t1", "u2");
    await recordReminderSent("t2", "u1");

    await clearRemindersForTask("t1");

    expect(await listAlreadyReminded(["t1", "t2"])).toEqual(new Set(["t2:u1"]));
  });
});
