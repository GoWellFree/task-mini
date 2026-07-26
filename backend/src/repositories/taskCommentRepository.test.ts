import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  id: string;
  task_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  deleted_at: string | null;
}

const db = { comments: [] as Row[] };
let nextId = 1;

vi.mock("../lib/supabase.js", () => {
  function builder() {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "select" | "update" = "select";
    let updates: Partial<Row> = {};

    const matched = () => db.comments.filter((row) => filters.every((f) => f(row)));

    const b = {
      select: () => b,
      eq(column: keyof Row, value: unknown) {
        filters.push((row) => row[column] === value);
        return b;
      },
      is(column: keyof Row, value: null) {
        filters.push((row) => row[column] === value);
        return b;
      },
      order: () => b,
      update(values: Partial<Row>) {
        mode = "update";
        updates = values;
        return b;
      },
      insert(values: Omit<Row, "id" | "deleted_at">) {
        const row: Row = { id: `c${nextId++}`, deleted_at: null, ...values };
        db.comments.push(row);
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
      // softDelete has no terminal .single()/.maybeSingle() — real
      // supabase-js query builders are thenables, so `await builder` alone
      // already executes the query. This must apply a pending update too,
      // not just report matches, or softDelete silently no-ops (see the
      // identical fix in taskRepository.test.ts earlier in this session).
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const hits = matched();
        if (mode === "update") {
          for (const row of hits) Object.assign(row, updates);
        }
        resolve({ data: hits, error: null });
      },
    };
    return b;
  }

  return { supabase: { from: () => builder() } };
});

const { create, getById, listForTask, softDelete, updateBody } = await import("./taskCommentRepository.js");

beforeEach(() => {
  db.comments = [];
  nextId = 1;
});

describe("create / listForTask", () => {
  it("creates a top-level comment", async () => {
    const comment = await create("task-1", "user-1", "Готово!", null);
    expect(comment).toMatchObject({ task_id: "task-1", author_id: "user-1", body: "Готово!", parent_comment_id: null });
  });

  it("creates a reply pointing at its parent", async () => {
    const parent = await create("task-1", "user-1", "Вопрос?", null);
    const reply = await create("task-1", "user-2", "Ответ.", parent.id);
    expect(reply.parent_comment_id).toBe(parent.id);
  });

  it("lists only non-deleted comments for the given task, oldest first", async () => {
    await create("task-1", "user-1", "First", null);
    await create("task-2", "user-1", "Other task", null);
    const second = await create("task-1", "user-1", "Second", null);
    await softDelete(second.id);

    const comments = await listForTask("task-1");
    expect(comments.map((c) => c.body)).toEqual(["First"]);
  });
});

describe("updateBody", () => {
  it("changes the body", async () => {
    const comment = await create("task-1", "user-1", "Original", null);
    const updated = await updateBody(comment.id, "Edited");
    expect(updated.body).toBe("Edited");
  });
});

describe("softDelete / getById", () => {
  it("hides a deleted comment from getById", async () => {
    const comment = await create("task-1", "user-1", "x", null);
    await softDelete(comment.id);
    expect(await getById(comment.id)).toBeNull();
  });

  it("is idempotent", async () => {
    const comment = await create("task-1", "user-1", "x", null);
    await softDelete(comment.id);
    await expect(softDelete(comment.id)).resolves.toBeUndefined();
  });
});
