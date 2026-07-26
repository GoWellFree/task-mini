import type { RecurrenceRule } from "@task-mini/shared";
import type { Task } from "../types/index.js";

/**
 * Uses the UTC calendar-field setters deliberately: this runs on the
 * server, and Date's local (non-UTC) setDate/setMonth/etc. would advance by
 * calendar fields in the SERVER's own timezone, shifting the computed
 * instant by its UTC offset. The UTC variants keep this deterministic
 * regardless of where the process happens to run.
 */
export function computeNextOccurrence(from: Date, rule: RecurrenceRule, interval: number): Date {
  const next = new Date(from);
  switch (rule) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + interval);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + interval * 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + interval);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      break;
  }
  return next;
}

export interface RecurrenceRollResult {
  updates: Partial<Task>;
  /** True when this call rolled the task to its next occurrence instead of letting it complete. */
  rolled: boolean;
}

/**
 * If `updates` completes a recurring task, rolls the SAME task forward to
 * its next occurrence (status back to "todo", due_at advanced,
 * completed_at cleared) instead of letting it land as done — the common
 * model for recurring tasks: one row, rescheduled, rather than a new row
 * spawned per occurrence.
 *
 * Returns `updates` unchanged (rolled: false) when: this update doesn't
 * newly complete the task, the task isn't recurring, it has no due_at to
 * anchor the recurrence off of, or the next occurrence would fall after
 * recurrence_until — in that last case the recurrence has run its course,
 * so the task is allowed to complete normally instead of rolling further.
 */
export function applyRecurrenceOnCompletion(task: Task, updates: Partial<Task>): RecurrenceRollResult {
  const isCompleting = updates.status === "done" && task.status !== "done";
  if (!isCompleting || !task.recurrence_rule || !task.due_at) {
    return { updates, rolled: false };
  }

  const nextDueAt = computeNextOccurrence(new Date(task.due_at), task.recurrence_rule, task.recurrence_interval);
  if (task.recurrence_until && nextDueAt.getTime() > new Date(task.recurrence_until).getTime()) {
    return { updates, rolled: false };
  }

  return {
    updates: { ...updates, status: "todo", due_at: nextDueAt.toISOString(), completed_at: null },
    rolled: true,
  };
}
