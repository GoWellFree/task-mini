import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for the tasks table, exercising the compare-and-set logic. */
interface Row {
  id: string;
  version: number;
  deleted_at: string | null;
  status?: string;
  title?: string;
  description?: string | null;
  workspace_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

const db = { tasks: [] as Row[] };

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" = "select";
    let updates: Partial<Row> = {};

    let orderBy: { column: keyof Row; ascending: boolean } | null = null;

    const matched = () => db.tasks.filter((row) => filters.every((f) => f(row)));
    const apply = () => {
      let hits = matched();
      if (mode === "update") {
        for (const row of hits) Object.assign(row, updates);
      }
      if (orderBy) {
        const { column, ascending } = orderBy;
        hits = [...hits].sort((a, c) => {
          const av = a[column];
          const cv = c[column];
          if (av === cv) return 0;
          if (av === undefined || av === null) return 1;
          if (cv === undefined || cv === null) return -1;
          return (av < cv ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      return hits;
    };

    /** Undoes toQuotedIlikePattern's escaping, mirroring what Postgres does when parsing the DSL value. */
    const unquoteIlikePattern = (raw: string) =>
      raw
        .replace(/\\(.)/g, "$1")
        .slice(1, -1)
        .toLowerCase();

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
      order(column: keyof Row, opts: { ascending: boolean }) {
        orderBy = { column, ascending: opts.ascending };
        return b;
      },
      // Approximates real FTS well enough to test the fallback control
      // flow: a whole lowercased word in the query must equal a whole
      // lowercased word in title/description. Real stemming/ranking is
      // Postgres's job, verified live against the actual database instead.
      textSearch(_column: string, query: string) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
        filters.push((row) => {
          const haystack = `${row.title ?? ""} ${row.description ?? ""}`.toLowerCase();
          const haystackWords = haystack.split(/[^a-zа-яё0-9]+/i).filter(Boolean);
          return queryWords.some((w) => haystackWords.includes(w));
        });
        return b;
      },
      // Parses just enough of the real title.ilike."...",description.ilike."..."
      // DSL this repository's .or() call produces to prove the escaping in
      // toQuotedIlikePattern round-trips: unescape and substring-match, same
      // as ILIKE '%literal%' would once Postgres strips the DSL quoting.
      or(expr: string) {
        const match = /ilike\."((?:\\.|[^"\\])*)"/.exec(expr);
        const term = match ? unquoteIlikePattern(match[1]!) : "";
        filters.push((row) => `${row.title ?? ""} ${row.description ?? ""}`.toLowerCase().includes(term));
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

const { getActiveTaskById, listTasksForWorkspace, softDeleteTask, updateTaskWithVersionCheck, wouldCreateCycle } =
  await import("./taskRepository.js");

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

describe("listTasksForWorkspace", () => {
  beforeEach(() => {
    db.tasks = [
      { id: "t1", version: 1, deleted_at: null, workspace_id: "ws-1", title: "Купить молоко", created_at: "2024-01-03" },
      {
        id: "t2",
        version: 1,
        deleted_at: null,
        workspace_id: "ws-1",
        title: "Помыть машину",
        description: "Не забыть про молоко тоже",
        created_at: "2024-01-02",
      },
      { id: "t3", version: 1, deleted_at: null, workspace_id: "ws-1", title: "Позвонить в банк", created_at: "2024-01-01" },
      { id: "t4", version: 1, deleted_at: null, workspace_id: "ws-2", title: "Молоко из другого воркспейса", created_at: "2024-01-01" },
    ];
  });

  it("returns all workspace tasks, newest first, when there is no search term", async () => {
    const tasks = await listTasksForWorkspace("ws-1");
    expect(tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("finds tasks by a whole-word FTS match in title or description, scoped to the workspace", async () => {
    const tasks = await listTasksForWorkspace("ws-1", { search: "молоко" });
    expect(tasks.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("falls back to a substring match when FTS finds no whole-word hit", async () => {
    // "молок" is a word fragment, not a whole word, so the FTS tier (which
    // matches on whole lexemes) finds nothing — this only passes if the
    // trigram/ILIKE fallback tier actually ran.
    const tasks = await listTasksForWorkspace("ws-1", { search: "молок" });
    expect(tasks.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("returns nothing when neither tier matches anything", async () => {
    expect(await listTasksForWorkspace("ws-1", { search: "непонятно_что" })).toEqual([]);
  });

  it("treats % and _ in the search term as literal characters, not ILIKE wildcards", async () => {
    db.tasks.push({ id: "t5", version: 1, deleted_at: null, workspace_id: "ws-1", title: "Скидка 50%", created_at: "2024-01-04" });
    const tasks = await listTasksForWorkspace("ws-1", { search: "50%" });
    expect(tasks.map((t) => t.id)).toEqual(["t5"]);
  });

  it("does not let PostgREST or()-DSL metacharacters in the search term break the query", async () => {
    db.tasks.push({
      id: "t6",
      version: 1,
      deleted_at: null,
      workspace_id: "ws-1",
      title: "Тест (важно), сделать",
      created_at: "2024-01-04",
    });
    const tasks = await listTasksForWorkspace("ws-1", { search: "(важно)," });
    expect(tasks.map((t) => t.id)).toEqual(["t6"]);
  });
});
