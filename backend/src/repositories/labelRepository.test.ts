import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
}

const db = { labels: [] as Row[] };
let nextId = 1;

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" = "select";
    let updates: Partial<Row> = {};

    const matched = () => db.labels.filter((row) => filters.every((f) => f(row)));

    const b = {
      select: () => b,
      eq(column: keyof Row, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      order: () => b,
      update(values: Partial<Row>) {
        mode = "update";
        updates = values;
        return b;
      },
      insert(values: { workspace_id: string; name: string; color: string | null }) {
        const duplicate = db.labels.some(
          (row) => row.workspace_id === values.workspace_id && row.name === values.name,
        );
        if (duplicate) {
          return {
            select: () => ({
              single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
            }),
          };
        }
        const row: Row = { id: `l${nextId++}`, ...values };
        db.labels.push(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      delete() {
        mode = "delete" as never;
        return b;
      },
      single: async () => {
        if (mode === "update") {
          const hits = matched();
          if (hits.length === 0) return { data: null, error: null };
          const target = hits[0]!;
          const wouldDuplicate = db.labels.some(
            (row) =>
              row.id !== target.id &&
              row.workspace_id === target.workspace_id &&
              row.name === (updates.name ?? target.name),
          );
          if (wouldDuplicate) return { data: null, error: { code: "23505", message: "duplicate key" } };
          Object.assign(target, updates);
          return { data: target, error: null };
        }
        return { data: matched()[0] ?? null, error: null };
      },
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const hits = matched();
        if ((mode as string) === "delete") {
          for (const hit of hits) {
            const i = db.labels.indexOf(hit);
            if (i >= 0) db.labels.splice(i, 1);
          }
        }
        resolve({ data: hits, error: null });
      },
    };
    return b;
  }

  return { supabase: { from: () => builder() } };
});

const { createLabel, deleteLabel, getLabelById, listLabelsForWorkspace, updateLabel } = await import(
  "./labelRepository.js"
);

beforeEach(() => {
  db.labels = [];
  nextId = 1;
});

describe("createLabel", () => {
  it("creates a label", async () => {
    const label = await createLabel("ws-1", "Срочно", "#FF0000");
    expect(label).toMatchObject({ workspace_id: "ws-1", name: "Срочно", color: "#FF0000" });
  });

  it("rejects a duplicate name in the same workspace with LABEL_NAME_TAKEN", async () => {
    await createLabel("ws-1", "Срочно", null);
    await expect(createLabel("ws-1", "Срочно", null)).rejects.toMatchObject({ code: "LABEL_NAME_TAKEN" });
  });

  it("allows the same name in a different workspace", async () => {
    await createLabel("ws-1", "Срочно", null);
    await expect(createLabel("ws-2", "Срочно", null)).resolves.toMatchObject({ workspace_id: "ws-2" });
  });
});

describe("updateLabel", () => {
  it("renames a label", async () => {
    const label = await createLabel("ws-1", "Old", null);
    const updated = await updateLabel(label.id, { name: "New" });
    expect(updated.name).toBe("New");
  });

  it("rejects renaming to a name already used in the same workspace", async () => {
    await createLabel("ws-1", "A", null);
    const b = await createLabel("ws-1", "B", null);
    await expect(updateLabel(b.id, { name: "A" })).rejects.toMatchObject({ code: "LABEL_NAME_TAKEN" });
  });
});

describe("getLabelById / listLabelsForWorkspace / deleteLabel", () => {
  it("lists only the labels for the given workspace", async () => {
    await createLabel("ws-1", "A", null);
    await createLabel("ws-2", "B", null);
    const labels = await listLabelsForWorkspace("ws-1");
    expect(labels.map((l) => l.name)).toEqual(["A"]);
  });

  it("deletes a label", async () => {
    const label = await createLabel("ws-1", "A", null);
    await deleteLabel(label.id);
    expect(await getLabelById(label.id)).toBeNull();
  });
});
