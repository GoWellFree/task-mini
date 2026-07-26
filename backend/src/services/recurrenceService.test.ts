import { describe, expect, it } from "vitest";
import { applyRecurrenceOnCompletion, computeNextOccurrence } from "./recurrenceService.js";
import type { Task } from "../types/index.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    workspace_id: "ws-1",
    title: "Полить цветы",
    description: null,
    creator_id: "user-1",
    assignee_id: null,
    status: "todo",
    due_at: "2024-03-01T09:00:00.000Z",
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

describe("computeNextOccurrence", () => {
  const from = new Date("2024-03-01T09:00:00.000Z");

  it("advances by whole days for 'daily'", () => {
    expect(computeNextOccurrence(from, "daily", 1).toISOString()).toBe("2024-03-02T09:00:00.000Z");
    expect(computeNextOccurrence(from, "daily", 3).toISOString()).toBe("2024-03-04T09:00:00.000Z");
  });

  it("advances by whole weeks for 'weekly'", () => {
    expect(computeNextOccurrence(from, "weekly", 1).toISOString()).toBe("2024-03-08T09:00:00.000Z");
    expect(computeNextOccurrence(from, "weekly", 2).toISOString()).toBe("2024-03-15T09:00:00.000Z");
  });

  it("advances by whole months for 'monthly', including a year rollover", () => {
    expect(computeNextOccurrence(from, "monthly", 1).toISOString()).toBe("2024-04-01T09:00:00.000Z");
    expect(computeNextOccurrence(new Date("2024-12-01T09:00:00.000Z"), "monthly", 1).toISOString()).toBe(
      "2025-01-01T09:00:00.000Z",
    );
  });

  it("advances by whole years for 'yearly'", () => {
    expect(computeNextOccurrence(from, "yearly", 1).toISOString()).toBe("2025-03-01T09:00:00.000Z");
  });

  it("is unaffected by the server's local timezone (uses UTC fields)", () => {
    // A date exactly at a UTC day boundary is the case most likely to break
    // under local-timezone date math, since a local setDate/setMonth would
    // shift by the server's own UTC offset.
    const midnight = new Date("2024-03-01T00:00:00.000Z");
    expect(computeNextOccurrence(midnight, "daily", 1).toISOString()).toBe("2024-03-02T00:00:00.000Z");
  });
});

describe("applyRecurrenceOnCompletion", () => {
  it("leaves a non-completing update untouched", () => {
    const task = makeTask({ recurrence_rule: "daily", status: "todo" });
    const updates = { title: "Renamed" };
    expect(applyRecurrenceOnCompletion(task, updates)).toEqual({ updates, rolled: false });
  });

  it("leaves completing a non-recurring task untouched", () => {
    const task = makeTask({ recurrence_rule: null, status: "todo" });
    const updates = { status: "done" as const };
    expect(applyRecurrenceOnCompletion(task, updates)).toEqual({ updates, rolled: false });
  });

  it("leaves completing a recurring task with no due_at untouched (nothing to anchor the recurrence to)", () => {
    const task = makeTask({ recurrence_rule: "daily", due_at: null, status: "todo" });
    const updates = { status: "done" as const };
    expect(applyRecurrenceOnCompletion(task, updates)).toEqual({ updates, rolled: false });
  });

  it("does not re-roll a task that is already done (status unchanged, not newly completing)", () => {
    const task = makeTask({ recurrence_rule: "daily", status: "done" });
    const updates = { status: "done" as const };
    expect(applyRecurrenceOnCompletion(task, updates)).toEqual({ updates, rolled: false });
  });

  it("rolls a daily recurring task to its next due date, resetting status and completed_at", () => {
    const task = makeTask({
      recurrence_rule: "daily",
      recurrence_interval: 1,
      due_at: "2024-03-01T09:00:00.000Z",
      status: "in_progress",
    });
    const result = applyRecurrenceOnCompletion(task, { status: "done", completed_at: "2024-03-01T10:00:00.000Z" });
    expect(result).toEqual({
      rolled: true,
      updates: {
        status: "todo",
        completed_at: null,
        due_at: "2024-03-02T09:00:00.000Z",
      },
    });
  });

  it("honors a custom recurrence_interval (every 2 weeks)", () => {
    const task = makeTask({ recurrence_rule: "weekly", recurrence_interval: 2, due_at: "2024-03-01T09:00:00.000Z" });
    const result = applyRecurrenceOnCompletion(task, { status: "done" });
    expect(result.updates.due_at).toBe("2024-03-15T09:00:00.000Z");
    expect(result.rolled).toBe(true);
  });

  it("preserves other fields present in the same update alongside the roll", () => {
    const task = makeTask({ recurrence_rule: "daily", due_at: "2024-03-01T09:00:00.000Z" });
    const result = applyRecurrenceOnCompletion(task, { status: "done", priority: "high" });
    expect(result.updates).toMatchObject({ priority: "high", status: "todo" });
  });

  it("completes normally instead of rolling once the next occurrence would pass recurrence_until", () => {
    const task = makeTask({
      recurrence_rule: "daily",
      due_at: "2024-03-01T09:00:00.000Z",
      recurrence_until: "2024-03-01T12:00:00.000Z", // ends today — tomorrow's occurrence is past this
    });
    const updates = { status: "done" as const };
    expect(applyRecurrenceOnCompletion(task, updates)).toEqual({ updates, rolled: false });
  });

  it("still rolls when the next occurrence lands on or before recurrence_until", () => {
    const task = makeTask({
      recurrence_rule: "daily",
      due_at: "2024-03-01T09:00:00.000Z",
      recurrence_until: "2024-03-05T00:00:00.000Z",
    });
    const result = applyRecurrenceOnCompletion(task, { status: "done" });
    expect(result.rolled).toBe(true);
    expect(result.updates.due_at).toBe("2024-03-02T09:00:00.000Z");
  });
});
