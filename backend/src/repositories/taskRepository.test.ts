import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for the tasks table, exercising the compare-and-set logic. */
interface Row {
  id: string;
  version: number;
  deleted_at: string | null;
  status?: string;
  title?: string;
  [key: string]: unknown;
}

const db = { tasks: [] as Row[] };

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" = "select";
    let updates: Partial<Row> = {};

    const matched = () => db.tasks.filter((row) => filters.every((f) => f(row)));
    const apply = () => {
      const hits = matched();
      if (mode === "update") {
        for (const row of hits) Object.assign(row, updates);
      }
      return hits;
    };

    const b = {
      select: () => b,
      update(values: Partial<Row>) {
        mode = "update";
        updates = values;
        return b;
      },
      eq(column: keyof Row, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      is(column: keyof Row, value: null) {
        filters.push((row) => row[column] === value);
        return b;
      },
      maybeSingle: async () => {
        const hits = apply();
        return { data: hits[0] ?? null, error: null };
      },
      // Real supabase-js query builders are thenables: `await builder` alone
      // (with no terminal .single()/.maybeSingle()) already executes the
      // query. softDeleteTask relies on exactly that. Without this, the mock
      // would silently no-op instead of applying the update.
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        resolve({ data: apply(), error: null });
      },
    };
    return b;
  }

  return { supabase: { from: () => builder() } };
});

const { getActiveTaskById, softDeleteTask, updateTaskWithVersionCheck, wouldCreateCycle } = await import(
  "./taskRepository.js"
);

beforeEach(() => {
  db.tasks = [{ id: "task-1", version: 1, deleted_at: null, status: "todo", title: "Original" }];
});

describe("getActiveTaskById", () => {
  it("returns the task when it is not deleted", async () => {
    const task = await getActiveTaskById("task-1");
    expect(task?.id).toBe("task-1");
  });

  it("returns null once the task is soft-deleted", async () => {
    db.tasks[0]!.deleted_at = new Date().toISOString();
    expect(await getActiveTaskById("task-1")).toBeNull();
  });

  it("returns null for an id that never existed", async () => {
    expect(await getActiveTaskById("no-such-id")).toBeNull();
  });
});

describe("updateTaskWithVersionCheck", () => {
  it("applies the update and increments the version when versions match", async () => {
    const result = await updateTaskWithVersionCheck("task-1", 1, { status: "done" });
    expect(result).toMatchObject({ ok: true, task: { status: "done", version: 2 } });
  });

  it("reports a conflict when the caller's version is stale", async () => {
    db.tasks[0]!.version = 2; // someone else already updated it
    const result = await updateTaskWithVersionCheck("task-1", 1, { status: "done" });
    expect(result).toEqual({ ok: false, reason: "version_conflict" });
    // The row must be untouched — a failed compare-and-set is not a partial write.
    expect(db.tasks[0]).toMatchObject({ version: 2, status: "todo" });
  });

  it("reports a conflict rather than resurrecting a task deleted concurrently", async () => {
    db.tasks[0]!.deleted_at = new Date().toISOString();
    const result = await updateTaskWithVersionCheck("task-1", 1, { status: "done" });
    expect(result).toEqual({ ok: false, reason: "version_conflict" });
  });

  it("lets only one of two writers at the same starting version through", async () => {
    // This mock has no real concurrency (each call resolves synchronously),
    // so it cannot reproduce true interleaving — that guarantee comes from
    // Postgres's atomic UPDATE ... WHERE, verified manually against the live
    // database. What this pins is the contract: a second writer holding the
    // same stale version as a first writer that already landed must be
    // refused, not silently allowed through because "it was still equal to
    // some version" or similar accidental relaxation of the check.
    const [a, b] = await Promise.all([
      updateTaskWithVersionCheck("task-1", 1, { title: "From A" }),
      updateTaskWithVersionCheck("task-1", 1, { title: "From B" }),
    ]);

    const outcomes = [a, b];
    const winners = outcomes.filter((r) => r.ok);
    const losers = outcomes.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, reason: "version_conflict" });
  });
});

describe("wouldCreateCycle", () => {
  beforeEach(() => {
    // A -> B -> C (A.parent_task_id = B, B.parent_task_id = C): C is B's
    // parent, B is A's parent.
    db.tasks = [
      { id: "A", version: 1, deleted_at: null, parent_task_id: "B" },
      { id: "B", version: 1, deleted_at: null, parent_task_id: "C" },
      { id: "C", version: 1, deleted_at: null, parent_task_id: null },
      { id: "D", version: 1, deleted_at: null, parent_task_id: null }, // unrelated
    ];
  });

  it("flags the trivial self-parent case", async () => {
    expect(await wouldCreateCycle("A", "A")).toBe(true);
  });

  it("allows attaching to an unrelated task", async () => {
    expect(await wouldCreateCycle("A", "D")).toBe(false);
  });

  it("allows extending the existing chain further (D becomes C's parent)", async () => {
    expect(await wouldCreateCycle("C", "D")).toBe(false);
  });

  it("flags a direct cycle: C (an ancestor of A) taking A as its parent", async () => {
    // A -> B -> C already; setting C.parent_task_id = A would close the loop.
    expect(await wouldCreateCycle("C", "A")).toBe(true);
  });

  it("flags the reverse of an existing direct link: B taking A as its parent", async () => {
    // A -> B already (B is A's parent). Also setting B.parent_task_id = A
    // would close a 2-node loop: A's parent is B, and B's parent is A.
    expect(await wouldCreateCycle("B", "A")).toBe(true);
  });
});

describe("softDeleteTask", () => {
  it("sets deleted_at without removing the row", async () => {
    await softDeleteTask("task-1");
    expect(db.tasks[0]!.deleted_at).not.toBeNull();
    expect(db.tasks).toHaveLength(1);
  });

  it("is idempotent — deleting an already-deleted task changes nothing further", async () => {
    await softDeleteTask("task-1");
    const firstDeletedAt = db.tasks[0]!.deleted_at;
    await softDeleteTask("task-1");
    expect(db.tasks[0]!.deleted_at).toBe(firstDeletedAt);
  });
});
