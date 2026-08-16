import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types/index.js";

interface Settings {
  userId: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  eveningDigestEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  notificationsEnabled: boolean;
}

interface TelegramInfo {
  telegramId: number;
  timezone: string;
}

const state = {
  settings: [] as Settings[],
  telegramInfo: new Map<string, TelegramInfo>(),
  assigneesByTask: new Map<string, string[]>(),
  candidateTasks: [] as Task[],
  alreadySent: new Set<string>(),
  recorded: [] as string[],
  notified: [] as { telegramId: number; kind: string; overdueIds: string[]; dueTodayIds: string[] }[],
};

vi.mock("../repositories/digestRepository.js", () => ({
  listUsersWithAnyDigestEnabled: async () => state.settings,
  fetchTelegramInfo: async (userIds: string[]) => {
    const map = new Map<string, TelegramInfo>();
    for (const id of userIds) {
      const info = state.telegramInfo.get(id);
      if (info) map.set(id, info);
    }
    return map;
  },
  listDigestCandidateTasks: async () => state.candidateTasks,
  listAlreadySentDigests: async () => state.alreadySent,
  recordDigestSent: async (userId: string, kind: string, sentOn: string) => {
    state.recorded.push(`${userId}:${kind}:${sentOn}`);
  },
}));

vi.mock("../repositories/reminderRepository.js", () => ({
  listAssigneeIdsByTask: async (taskIds: string[]) => {
    const map = new Map<string, string[]>();
    for (const id of taskIds) {
      const ids = state.assigneesByTask.get(id);
      if (ids) map.set(id, ids);
    }
    return map;
  },
}));

vi.mock("../lib/bot.js", () => ({
  notifyDigest: async ({
    telegramId,
    kind,
    overdue,
    dueToday,
  }: {
    telegramId: number;
    kind: string;
    overdue: Task[];
    dueToday: Task[];
  }) => {
    state.notified.push({
      telegramId,
      kind,
      overdueIds: overdue.map((t) => t.id),
      dueTodayIds: dueToday.map((t) => t.id),
    });
  },
}));

const { sendDueDigests } = await import("./digestService.js");

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    userId: "user-1",
    dailyDigestEnabled: false,
    dailyDigestTime: "09:00",
    eveningDigestEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    notificationsEnabled: true,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    workspace_id: "ws-1",
    title: "Полить цветы",
    description: null,
    creator_id: "creator-1",
    assignee_id: null,
    status: "todo",
    due_at: "2026-03-15T09:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    version: 1,
    deleted_at: null,
    project_id: null,
    parent_task_id: null,
    priority: "none",
    start_at: null,
    completed_at: null,
    estimate_minutes: null,
    actual_minutes: null,
    position: 0,
    archived_at: null,
    recurrence_rule: null,
    recurrence_interval: 1,
    recurrence_until: null,
    ...overrides,
  };
}

// 09:00 UTC on 2026-03-15 — also 09:00 for a "UTC" recipient, used as the default "it's digest time" instant.
const NOW = new Date("2026-03-15T09:00:00.000Z");

beforeEach(() => {
  state.settings = [];
  state.telegramInfo = new Map();
  state.assigneesByTask = new Map();
  state.candidateTasks = [];
  state.alreadySent = new Set();
  state.recorded = [];
  state.notified = [];
});

describe("sendDueDigests", () => {
  it("does nothing when no one has digests enabled", async () => {
    const result = await sendDueDigests(NOW);
    expect(result).toEqual({ usersChecked: 0, digestsSent: 0 });
  });

  it("sends a daily digest at the user's configured local time", async () => {
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "09:00" })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1", due_at: "2026-03-15T09:00:00.000Z" })];

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(1);
    expect(state.notified).toEqual([{ telegramId: 555, kind: "daily", overdueIds: [], dueTodayIds: ["t1"] }]);
    expect(state.recorded).toEqual(["u1:daily:2026-03-15"]);
  });

  it("does not send when the current local time doesn't match the configured digest time", async () => {
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "10:00" })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1" })];

    const result = await sendDueDigests(NOW); // NOW is 09:00, digest wants 10:00

    expect(result.digestsSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("uses the recipient's own timezone, not UTC, to decide whether it's their digest time", async () => {
    // 09:00 UTC = 12:00 in Europe/Moscow (UTC+3, no DST).
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "12:00" })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "Europe/Moscow" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1", due_at: "2026-03-15T09:00:00.000Z" })];

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(1);
  });

  it("sends an evening digest at the fixed evening hour", async () => {
    state.settings = [makeSettings({ userId: "u1", eveningDigestEnabled: true })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1", due_at: "2026-03-15T10:00:00.000Z" })];

    const evening = new Date("2026-03-15T18:00:00.000Z");
    const result = await sendDueDigests(evening);

    expect(result.digestsSent).toBe(1);
    expect(state.notified[0]?.kind).toBe("evening");
  });

  it("sends both digests independently when a user has both enabled and both match", async () => {
    // Same fixed instant can't match both a configurable daily time AND the fixed
    // evening hour unless dailyDigestTime is itself set to the evening hour.
    state.settings = [
      makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "18:00", eveningDigestEnabled: true }),
    ];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1", due_at: "2026-03-15T10:00:00.000Z" })];

    const result = await sendDueDigests(new Date("2026-03-15T18:00:00.000Z"));

    expect(result.digestsSent).toBe(2);
    expect(state.notified.map((n) => n.kind).sort()).toEqual(["daily", "evening"]);
    expect(state.recorded.sort()).toEqual(["u1:daily:2026-03-15", "u1:evening:2026-03-15"]);
  });

  it("skips a user in quiet hours even if the digest time matches", async () => {
    state.settings = [
      makeSettings({
        userId: "u1",
        dailyDigestEnabled: true,
        dailyDigestTime: "09:00",
        quietHoursStart: "22:00",
        quietHoursEnd: "10:00",
      }),
    ];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1" })];

    const result = await sendDueDigests(NOW); // 09:00 falls inside 22:00-10:00

    expect(result.digestsSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("does not resend a digest already sent for that local date", async () => {
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "09:00" })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1" })];
    state.alreadySent = new Set(["u1:daily:2026-03-15"]);

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("skips a recipient with no telegram_id", async () => {
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "09:00" })];
    // no state.telegramInfo entry for u1
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1" })];

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(0);
  });

  it("skips a recipient with notifications disabled", async () => {
    state.settings = [
      makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "09:00", notificationsEnabled: false }),
    ];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "u1" })];

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(0);
  });

  it("does not send an empty digest when the user has nothing overdue or due today", async () => {
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "09:00" })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = []; // nothing at all

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("separates overdue tasks from tasks due later today", async () => {
    state.settings = [makeSettings({ userId: "u1", dailyDigestEnabled: true, dailyDigestTime: "09:00" })];
    state.telegramInfo.set("u1", { telegramId: 555, timezone: "UTC" });
    state.candidateTasks = [
      makeTask({ id: "overdue-1", creator_id: "u1", due_at: "2026-03-15T08:00:00.000Z" }), // 1h before NOW
      makeTask({ id: "later-today", creator_id: "u1", due_at: "2026-03-15T20:00:00.000Z" }), // later today
      makeTask({ id: "tomorrow", creator_id: "u1", due_at: "2026-03-16T08:00:00.000Z" }), // not today
    ];

    await sendDueDigests(NOW);

    expect(state.notified[0]?.overdueIds).toEqual(["overdue-1"]);
    expect(state.notified[0]?.dueTodayIds).toEqual(["later-today"]);
  });

  it("routes to assignees instead of the creator when the task has any", async () => {
    state.settings = [makeSettings({ userId: "assignee-1", dailyDigestEnabled: true, dailyDigestTime: "09:00" })];
    state.telegramInfo.set("assignee-1", { telegramId: 777, timezone: "UTC" });
    state.candidateTasks = [makeTask({ id: "t1", creator_id: "creator-1" })];
    state.assigneesByTask.set("t1", ["assignee-1"]);

    const result = await sendDueDigests(NOW);

    expect(result.digestsSent).toBe(1);
    expect(state.notified[0]?.telegramId).toBe(777);
  });
});
