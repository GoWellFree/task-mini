import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
  completed_at: string | null;
}

const db = { items: [] as Row[] };
let nextId = 1;

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" | "delete" = "select";
    let updates: Partial<Row> = {};

    const matched = () => db.items.filter((row) => filters.every((f) => f(row)));

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
      delete() {
        mode = "delete";
        return b;
      },
      insert(values: { task_id: string; title: string }) {
        const row: Row = { id: `ci${nextId++}`, is_done: false, position: 0, completed_at: null, ...values };
        db.items.push(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      single: async () => {
        if (mode === "update") {
          const hits = matched();
          if (hits.length === 0) return { data: null, error: null };
          Object.assign(hits[0]!, updates);
          return { data: hits[0], error: null };
        }
        return { data: matched()[0] ?? null, error: null };
      },
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const hits = matched();
        if (mode === "delete") {
          for (const hit of hits) {
            const i = db.items.indexOf(hit);
            if (i >= 0) db.items.splice(i, 1);
          }
        }
        resolve({ data: hits, error: null });
      },
    };
    return b;
  }

  return { supabase: { from: () => builder() } };
});

const { create, getById, listForTask, remove, update } = await import("./checklistItemRepository.js");

beforeEach(() => {
  db.items = [];
  nextId = 1;
});

describe("create / listForTask", () => {
  it("creates an item with sensible defaults", async () => {
    const item = await create("task-1", "Купить муку");
    expect(item).toMatchObject({ task_id: "task-1", title: "Купить муку", is_done: false, completed_at: null });
  });

  it("lists only items for the given task, in position order", async () => {
    await create("task-1", "A");
    await create("task-2", "B");
    const items = await listForTask("task-1");
    expect(items.map((i) => i.title)).toEqual(["A"]);
  });
});

describe("update", () => {
  it("stamps completed_at when marked done", async () => {
    const item = await create("task-1", "A");
    const updated = await update(item.id, { is_done: true });
    expect(updated.is_done).toBe(true);
    expect(updated.completed_at).not.toBeNull();
  });

  it("clears completed_at when un-marked", async () => {
    const item = await create("task-1", "A");
    await update(item.id, { is_done: true });
    const reopened = await update(item.id, { is_done: false });
    expect(reopened.is_done).toBe(false);
    expect(reopened.completed_at).toBeNull();
  });

  it("renaming or repositioning does not touch completed_at", async () => {
    const item = await create("task-1", "A");
    await update(item.id, { is_done: true });
    const renamed = await update(item.id, { title: "B" });
    expect(renamed.completed_at).not.toBeNull();
    expect(renamed.title).toBe("B");
  });
});

describe("remove / getById", () => {
  it("deletes an item", async () => {
    const item = await create("task-1", "A");
    await remove(item.id);
    expect(await getById(item.id)).toBeNull();
  });
});
