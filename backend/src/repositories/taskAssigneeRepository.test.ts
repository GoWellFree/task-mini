import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  task_id: string;
  user_id: string;
  assigned_by: string | null;
}

const db = { rows: [] as Row[] };
let nextId = 1;

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Row) => boolean> = [];
    let pendingDelete = false;

    const matched = () => db.rows.filter((row) => filters.every((f) => f(row)));

    const b = {
      select: () => b,
      eq(column: keyof Row, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      order: () => b,
      delete() {
        pendingDelete = true;
        return b;
      },
      upsert(values: { task_id: string; user_id: string; assigned_by: string | null }) {
        const existing = db.rows.find((r) => r.task_id === values.task_id && r.user_id === values.user_id);
        if (!existing) {
          db.rows.push({ id: `ta${nextId++}`, ...values });
        }
        return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
      },
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const hits = matched();
        if (pendingDelete) {
          for (const hit of hits) {
            const i = db.rows.indexOf(hit);
            if (i >= 0) db.rows.splice(i, 1);
          }
        }
        resolve({ data: hits, error: null });
      },
    };
    return b;
  }

  return { supabase: { from: () => builder() } };
});

const { addAssignee, clearAssignees, listAssigneeIds, removeAssignee } = await import(
  "./taskAssigneeRepository.js"
);

beforeEach(() => {
  db.rows = [];
  nextId = 1;
});

describe("addAssignee", () => {
  it("adds a row", async () => {
    await addAssignee("task-1", "user-1", "user-creator");
    expect(await listAssigneeIds("task-1")).toEqual(["user-1"]);
  });

  it("is idempotent — adding the same person twice keeps one row", async () => {
    await addAssignee("task-1", "user-1", "user-creator");
    await addAssignee("task-1", "user-1", "user-creator");
    expect(await listAssigneeIds("task-1")).toEqual(["user-1"]);
  });
});

describe("removeAssignee", () => {
  it("removes only the matching task+user pair", async () => {
    await addAssignee("task-1", "user-1", "user-creator");
    await addAssignee("task-1", "user-2", "user-creator");

    await removeAssignee("task-1", "user-1");

    expect(await listAssigneeIds("task-1")).toEqual(["user-2"]);
  });

  it("removing someone not assigned is a no-op", async () => {
    await addAssignee("task-1", "user-1", "user-creator");
    await removeAssignee("task-1", "user-99");
    expect(await listAssigneeIds("task-1")).toEqual(["user-1"]);
  });
});

describe("clearAssignees", () => {
  it("removes every assignee for the task without touching other tasks", async () => {
    await addAssignee("task-1", "user-1", "user-creator");
    await addAssignee("task-1", "user-2", "user-creator");
    await addAssignee("task-2", "user-3", "user-creator");

    await clearAssignees("task-1");

    expect(await listAssigneeIds("task-1")).toEqual([]);
    expect(await listAssigneeIds("task-2")).toEqual(["user-3"]);
  });
});
