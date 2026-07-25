import { describe, expect, it } from "vitest";
import { createTaskSchema, createWorkspaceSchema, updateTaskSchema, TITLE_MAX } from "./schemas.js";

const VALID_UUID = "11111111-2222-4333-8444-555555555555";

describe("createTaskSchema", () => {
  it("accepts a minimal valid task", () => {
    const result = createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "Купить хлеб" });
    expect(result.success).toBe(true);
  });

  it("trims the title and rejects whitespace-only titles", () => {
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "   " }).success).toBe(false);

    const parsed = createTaskSchema.parse({ workspaceId: VALID_UUID, title: "  Отчёт  " });
    expect(parsed.title).toBe("Отчёт");
  });

  it("rejects a non-UUID workspaceId", () => {
    expect(createTaskSchema.safeParse({ workspaceId: "not-a-uuid", title: "x" }).success).toBe(false);
  });

  it("rejects an over-long title", () => {
    const title = "x".repeat(TITLE_MAX + 1);
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title }).success).toBe(false);
  });

  it("rejects a status outside the supported set", () => {
    const result = createTaskSchema.safeParse({
      workspaceId: VALID_UUID,
      title: "x",
      status: "archived",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dueAt that is not a real timestamp", () => {
    const result = createTaskSchema.safeParse({
      workspaceId: VALID_UUID,
      title: "x",
      dueAt: "31-12-2026",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an ISO timestamp for dueAt", () => {
    const result = createTaskSchema.safeParse({
      workspaceId: VALID_UUID,
      title: "x",
      dueAt: "2026-12-31T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateTaskSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("allows explicitly clearing the assignee and due date", () => {
    const result = updateTaskSchema.safeParse({ assigneeId: null, dueAt: null });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID assignee", () => {
    expect(updateTaskSchema.safeParse({ assigneeId: "nope" }).success).toBe(false);
  });
});

describe("createWorkspaceSchema", () => {
  it("requires a non-empty name", () => {
    expect(createWorkspaceSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "Семья" }).success).toBe(true);
  });
});
