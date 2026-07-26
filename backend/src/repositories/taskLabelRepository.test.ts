import { beforeEach, describe, expect, it, vi } from "vitest";

interface LabelRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
}
interface TaskLabelRow {
  task_id: string;
  label_id: string;
}

const db = {
  labels: [] as LabelRow[],
  taskLabels: [] as TaskLabelRow[],
};

vi.mock("../lib/supabase.js", () => {
  function labelsBuilder() {
    const filters: Array<(row: LabelRow) => boolean> = [];
    const b = {
      select: () => b,
      eq(column: keyof LabelRow, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      then(resolve: (v: { data: LabelRow[]; error: null }) => void) {
        resolve({ data: db.labels.filter((row) => filters.every((f) => f(row))), error: null });
      },
    };
    return b;
  }

  function taskLabelsBuilder() {
    const filters: Array<(row: TaskLabelRow) => boolean> = [];
    let pendingDelete = false;

    const matched = () => db.taskLabels.filter((row) => filters.every((f) => f(row)));

    const b = {
      select(query: string) {
        // listLabelsForTask joins labels — resolve it eagerly into the shape
        // Supabase would return, rather than modeling PostgREST's embed syntax.
        if (query.includes("labels")) {
          return {
            eq(column: keyof TaskLabelRow, value: unknown) {
              filters.push((row) => row[column] === value);
              return {
                then(resolve: (v: { data: Array<{ label: LabelRow }>; error: null }) => void) {
                  const rows = matched().map((row) => ({
                    label: db.labels.find((l) => l.id === row.label_id)!,
                  }));
                  resolve({ data: rows, error: null });
                },
              };
            },
          };
        }
        return b;
      },
      eq(column: keyof TaskLabelRow, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      delete() {
        pendingDelete = true;
        return b;
      },
      upsert(values: TaskLabelRow) {
        const exists = db.taskLabels.some((r) => r.task_id === values.task_id && r.label_id === values.label_id);
        if (!exists) db.taskLabels.push({ ...values });
        return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
      },
      then(resolve: (v: { data: TaskLabelRow[]; error: null }) => void) {
        const hits = matched();
        if (pendingDelete) {
          for (const hit of hits) {
            const i = db.taskLabels.indexOf(hit);
            if (i >= 0) db.taskLabels.splice(i, 1);
          }
        }
        resolve({ data: hits, error: null });
      },
    };
    return b;
  }

  return {
    supabase: {
      from: (table: string) => (table === "labels" ? labelsBuilder() : taskLabelsBuilder()),
    },
  };
});

const { attachLabel, detachLabel, listLabelsForTask } = await import("./taskLabelRepository.js");

beforeEach(() => {
  db.labels = [
    { id: "label-1", workspace_id: "ws-1", name: "Срочно", color: "#FF0000" },
    { id: "label-2", workspace_id: "ws-1", name: "Баг", color: null },
  ];
  db.taskLabels = [];
});

describe("attachLabel / listLabelsForTask", () => {
  it("attaches a label and lists it for that task", async () => {
    await attachLabel("task-1", "label-1");
    const labels = await listLabelsForTask("task-1");
    expect(labels.map((l) => l.id)).toEqual(["label-1"]);
  });

  it("is idempotent — attaching the same label twice keeps one row", async () => {
    await attachLabel("task-1", "label-1");
    await attachLabel("task-1", "label-1");
    expect(db.taskLabels).toHaveLength(1);
  });

  it("keeps labels scoped to their own task", async () => {
    await attachLabel("task-1", "label-1");
    await attachLabel("task-2", "label-2");
    expect((await listLabelsForTask("task-1")).map((l) => l.id)).toEqual(["label-1"]);
    expect((await listLabelsForTask("task-2")).map((l) => l.id)).toEqual(["label-2"]);
  });
});

describe("detachLabel", () => {
  it("removes only the matching task+label pair", async () => {
    await attachLabel("task-1", "label-1");
    await attachLabel("task-1", "label-2");

    await detachLabel("task-1", "label-1");

    expect((await listLabelsForTask("task-1")).map((l) => l.id)).toEqual(["label-2"]);
  });

  it("detaching something never attached is a no-op", async () => {
    await attachLabel("task-1", "label-1");
    await detachLabel("task-1", "label-2");
    expect((await listLabelsForTask("task-1")).map((l) => l.id)).toEqual(["label-1"]);
  });
});
