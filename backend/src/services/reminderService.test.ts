import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types/index.js";

interface RecipientInfo {
  telegramId: number | null;
  reminderMinutes: number;
  notificationsEnabled: boolean;
}

const state = {
  tasks: [] as Task[],
  assigneesByTask: new Map<string, string[]>(),
  alreadyReminded: new Set<string>(),
  recipientInfo: new Map<string, RecipientInfo>(),
  recorded: [] as string[],
  notified: [] as { telegramId: number; taskId: string }[],
  failNotifyFor: new Set<number>(),
};

vi.mock("../repositories/taskRepository.js", () => ({
  listActiveTasksDueWithin: async () => state.tasks,
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
  listAlreadyReminded: async () => state.alreadyReminded,
  fetchRecipientInfo: async (userIds: string[]) => {
    const map = new Map<string, RecipientInfo>();
    for (const id of userIds) {
      const info = state.recipientInfo.get(id);
      if (info) map.set(id, info);
    }
    return map;
  },
  recordReminderSent: async (taskId: string, userId: string) => {
    state.recorded.push(`${taskId}:${userId}`);
  },
}));

vi.mock("../lib/bot.js", () => ({
  notifyTaskReminder: async ({ telegramId, task }: { telegramId: number; task: Task }) => {
    if (state.failNotifyFor.has(telegramId)) throw new Error("simulated Telegram send failure");
    state.notified.push({ telegramId, taskId: task.id });
  },
}));

const { sendDueReminders } = await import("./reminderService.js");

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    workspace_id: "ws-1",
    title: "Полить цветы",
    description: null,
    creator_id: "creator-1",
    assignee_id: null,
    status: "todo",
    due_at: "2024-03-01T09:30:00.000Z",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
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

const NOW = new Date("2024-03-01T09:00:00.000Z");

beforeEach(() => {
  state.tasks = [];
  state.assigneesByTask = new Map();
  state.alreadyReminded = new Set();
  state.recipientInfo = new Map();
  state.recorded = [];
  state.notified = [];
  state.failNotifyFor = new Set();
});

describe("sendDueReminders", () => {
  it("does nothing when there are no candidate tasks", async () => {
    const result = await sendDueReminders(NOW);
    expect(result).toEqual({ tasksChecked: 0, remindersSent: 0 });
    expect(state.notified).toEqual([]);
  });

  it("falls back to the creator when a task has no assignees", async () => {
    const task = makeTask({ id: "t1", creator_id: "creator-1" });
    state.tasks = [task];
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 30, notificationsEnabled: true });

    const result = await sendDueReminders(NOW);

    expect(result).toEqual({ tasksChecked: 1, remindersSent: 1 });
    expect(state.notified).toEqual([{ telegramId: 555, taskId: "t1" }]);
    expect(state.recorded).toEqual(["t1:creator-1"]);
  });

  it("notifies assignees instead of the creator when the task has any", async () => {
    const task = makeTask({ id: "t1", creator_id: "creator-1" });
    state.tasks = [task];
    state.assigneesByTask.set("t1", ["assignee-1"]);
    state.recipientInfo.set("assignee-1", { telegramId: 777, reminderMinutes: 30, notificationsEnabled: true });
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 30, notificationsEnabled: true });

    await sendDueReminders(NOW);

    expect(state.notified).toEqual([{ telegramId: 777, taskId: "t1" }]);
  });

  it("does not send when the reminder window has not opened yet", async () => {
    // due in 30 min, but this recipient's lead time is only 10 min — too early.
    const task = makeTask({ id: "t1", due_at: "2024-03-01T09:30:00.000Z" });
    state.tasks = [task];
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 10, notificationsEnabled: true });

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("does not send once the task is already past due", async () => {
    const task = makeTask({ id: "t1", due_at: "2024-03-01T08:30:00.000Z" }); // 30 min ago
    state.tasks = [task];
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 120, notificationsEnabled: true });

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("sends exactly at the boundary of the reminder window (now == remindAt)", async () => {
    // due_at - reminderMinutes == NOW exactly.
    const task = makeTask({ id: "t1", due_at: "2024-03-01T09:30:00.000Z" });
    state.tasks = [task];
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 30, notificationsEnabled: true });

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(1);
  });

  it("skips a task/user pair that was already reminded", async () => {
    const task = makeTask({ id: "t1" });
    state.tasks = [task];
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 30, notificationsEnabled: true });
    state.alreadyReminded.add("t1:creator-1");

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(0);
    expect(state.notified).toEqual([]);
  });

  it("skips a recipient with notifications disabled", async () => {
    state.tasks = [makeTask({ id: "t1" })];
    state.recipientInfo.set("creator-1", { telegramId: 555, reminderMinutes: 30, notificationsEnabled: false });

    await sendDueReminders(NOW);

    expect(state.notified).toEqual([]);
    expect(state.recorded).toEqual([]);
  });

  it("skips a recipient with no telegram_id", async () => {
    state.tasks = [makeTask({ id: "t1" })];
    state.recipientInfo.set("creator-1", { telegramId: null, reminderMinutes: 30, notificationsEnabled: true });

    await sendDueReminders(NOW);

    expect(state.notified).toEqual([]);
  });

  it("skips gracefully when recipient info is missing entirely (not a crash)", async () => {
    state.tasks = [makeTask({ id: "t1" })];
    // no state.recipientInfo entry for "creator-1" at all

    const result = await sendDueReminders(NOW);

    expect(result).toEqual({ tasksChecked: 1, remindersSent: 0 });
  });

  it("evaluates multiple assignees on the same task independently, by their own lead time", async () => {
    const task = makeTask({ id: "t1", due_at: "2024-03-01T09:30:00.000Z" });
    state.tasks = [task];
    state.assigneesByTask.set("t1", ["a1", "a2"]);
    // a1's window is open now (30 min lead, due in 30 min); a2's is not (5 min lead).
    state.recipientInfo.set("a1", { telegramId: 111, reminderMinutes: 30, notificationsEnabled: true });
    state.recipientInfo.set("a2", { telegramId: 222, reminderMinutes: 5, notificationsEnabled: true });

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(1);
    expect(state.notified).toEqual([{ telegramId: 111, taskId: "t1" }]);
  });

  it("still records the reminder as sent even when the Telegram send itself fails", async () => {
    // A permanently-bad telegram_id (blocked bot, deleted account) must not
    // retry — and fail — on every single tick forever.
    state.tasks = [makeTask({ id: "t1" })];
    state.recipientInfo.set("creator-1", { telegramId: 999, reminderMinutes: 30, notificationsEnabled: true });
    state.failNotifyFor.add(999);

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(1);
    expect(state.recorded).toEqual(["t1:creator-1"]);
  });

  it("one recipient's send failure does not stop the rest of the batch from being processed", async () => {
    state.tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    state.recipientInfo.set("creator-1", { telegramId: 999, reminderMinutes: 30, notificationsEnabled: true });
    state.failNotifyFor.add(999);

    const result = await sendDueReminders(NOW);

    expect(result.remindersSent).toBe(2);
    expect(state.recorded.sort()).toEqual(["t1:creator-1", "t2:creator-1"]);
  });
});
