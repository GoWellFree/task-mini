import { beforeEach, describe, expect, it, vi } from "vitest";

interface TaskRow {
  id: string;
  title: string;
  status: string;
}
interface DependencyRow {
  task_id: string;
  depends_on_task_id: string;
  created_at: string;
}

const db = { tasks: [] as TaskRow[], dependencies: [] as DependencyRow[] };

vi.mock("../lib/supabase.js", () => {
  function tasksById(ids: string[]): Map<string, TaskRow> {
    return new Map(db.tasks.filter((t) => ids.includes(t.id)).map((t) => [t.id, t]));
  }

  function dependencyBuilder() {
    const filters: Array<(row: DependencyRow) => boolean> = [];
    let selectCol: "task_id" | "depends_on_task_id" | null = null;
    let embed: "depends_on" | "task" | null = null;
    let mode: "select" | "delete" | "upsert" = "select";
    let upsertValues: Partial<DependencyRow> | null = null;

    const matched = () => db.dependencies.filter((row) => filters.every((f) => f(row)));

    const b = {
      select(cols: string) {
        if (cols.includes("depends_on:")) embed = "depends_on";
        else if (cols.includes("task:")) embed = "task";
        else if (cols === "depends_on_task_id") selectCol = "depends_on_task_id";
        return b;
      },
      eq(column: keyof DependencyRow, value: string) {
        filters.push((row) => row[column] === value);
        return b;
      },
      in(column: keyof DependencyRow, values: string[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return b;
      },
      delete() {
        mode = "delete";
        return b;
      },
      upsert(values: Partial<DependencyRow>) {
        mode = "upsert";
        upsertValues = values;
        return b;
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (mode === "delete") {
          const hits = matched();
          for (const hit of hits) {
            const idx = db.dependencies.indexOf(hit);
            if (idx >= 0) db.dependencies.splice(idx, 1);
          }
          resolve({ data: null, error: null });
          return;
        }
        if (mode === "upsert" && upsertValues) {
          const values = upsertValues;
          const existing = db.dependencies.find(
            (row) => row.task_id === values.task_id && row.depends_on_task_id === values.depends_on_task_id,
          );
          if (!existing) {
            db.dependencies.push({ created_at: new Date().toISOString(), ...values } as DependencyRow);
          }
          resolve({ data: null, error: null });
          return;
        }

        const hits = matched();
        if (embed === "depends_on") {
          const taskMap = tasksById(hits.map((h) => h.depends_on_task_id));
          resolve({ data: hits.map((h) => ({ depends_on: taskMap.get(h.depends_on_task_id) })), error: null });
        } else if (embed === "task") {
          const taskMap = tasksById(hits.map((h) => h.task_id));
          resolve({ data: hits.map((h) => ({ task: taskMap.get(h.task_id) })), error: null });
        } else if (selectCol === "depends_on_task_id") {
          resolve({ data: hits.map((h) => ({ depends_on_task_id: h.depends_on_task_id })), error: null });
        } else {
          resolve({ data: hits, error: null });
        }
      },
    };
    return b;
  }

  return { supabase: { from: () => dependencyBuilder() } };
});

const {
  addDependency,
  areDependenciesResolved,
  listDependencies,
  listDependents,
  removeDependency,
  wouldCreateCycle,
} = await import("./taskDependencyRepository.js");

beforeEach(() => {
  db.tasks = [
    { id: "A", title: "Task A", status: "todo" },
    { id: "B", title: "Task B", status: "todo" },
    { id: "C", title: "Task C", status: "done" },
    { id: "D", title: "Task D", status: "todo" },
  ];
  db.dependencies = [];
});

describe("addDependency / listDependencies / listDependents", () => {
  it("records a dependency and lists it from both directions", async () => {
    await addDependency("A", "B");
    expect((await listDependencies("A")).map((t) => t.id)).toEqual(["B"]);
    expect((await listDependents("B")).map((t) => t.id)).toEqual(["A"]);
  });

  it("is idempotent — adding the same pair twice keeps one row", async () => {
    await addDependency("A", "B");
    await addDependency("A", "B");
    expect(db.dependencies).toHaveLength(1);
  });

  it("supports a task depending on several others", async () => {
    await addDependency("A", "B");
    await addDependency("A", "C");
    expect((await listDependencies("A")).map((t) => t.id).sort()).toEqual(["B", "C"]);
  });
});

describe("removeDependency", () => {
  it("removes exactly the given pair, leaving others intact", async () => {
    await addDependency("A", "B");
    await addDependency("A", "C");
    await removeDependency("A", "B");
    expect((await listDependencies("A")).map((t) => t.id)).toEqual(["C"]);
  });

  it("is idempotent — removing a pair that was never added changes nothing", async () => {
    await expect(removeDependency("A", "B")).resolves.toBeUndefined();
  });
});

describe("wouldCreateCycle", () => {
  it("flags the trivial self-dependency case", async () => {
    expect(await wouldCreateCycle("A", "A")).toBe(true);
  });

  it("allows depending on an unrelated task", async () => {
    expect(await wouldCreateCycle("A", "D")).toBe(false);
  });

  it("flags a direct 2-node cycle (A->B, then B->A)", async () => {
    await addDependency("A", "B");
    expect(await wouldCreateCycle("B", "A")).toBe(true);
  });

  it("flags an indirect cycle across a longer chain (A->B->C, then C->A)", async () => {
    await addDependency("A", "B");
    await addDependency("B", "C");
    expect(await wouldCreateCycle("C", "A")).toBe(true);
  });

  it("allows extending an existing chain further (D depending on A, where A->B->C already)", async () => {
    await addDependency("A", "B");
    await addDependency("B", "C");
    expect(await wouldCreateCycle("D", "A")).toBe(false);
  });

  it("does not flag a diamond shape as a cycle (A depends on both B and C, both depend on D)", async () => {
    await addDependency("B", "D");
    await addDependency("C", "D");
    expect(await wouldCreateCycle("A", "B")).toBe(false);
  });
});

describe("areDependenciesResolved", () => {
  it("is true when a task has no dependencies at all", async () => {
    expect(await areDependenciesResolved("A")).toBe(true);
  });

  it("is false when any dependency is not done", async () => {
    await addDependency("A", "B"); // B is "todo"
    expect(await areDependenciesResolved("A")).toBe(false);
  });

  it("is true once every dependency is done", async () => {
    await addDependency("A", "C"); // C is "done"
    expect(await areDependenciesResolved("A")).toBe(true);
  });

  it("is false when only some of several dependencies are done", async () => {
    await addDependency("A", "C"); // done
    await addDependency("A", "B"); // not done
    expect(await areDependenciesResolved("A")).toBe(false);
  });
});
