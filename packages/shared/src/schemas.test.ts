import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  createWorkspaceSchema,
  updateTaskSchema,
  updateUserSettingsSchema,
  TITLE_MAX,
} from "./schemas.js";

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

  it("requires version even when another field is present", () => {
    expect(updateTaskSchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("rejects version-only patches (nothing to actually update)", () => {
    expect(updateTaskSchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it("rejects a non-integer or zero version", () => {
    expect(updateTaskSchema.safeParse({ version: 1.5, status: "done" }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ version: 0, status: "done" }).success).toBe(false);
  });

  it("allows explicitly clearing the assignee and due date", () => {
    const result = updateTaskSchema.safeParse({ version: 1, assigneeId: null, dueAt: null });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID assignee", () => {
    expect(updateTaskSchema.safeParse({ version: 1, assigneeId: "nope" }).success).toBe(false);
  });
});

describe("createWorkspaceSchema", () => {
  it("requires a non-empty name", () => {
    expect(createWorkspaceSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createWorkspaceSchema.safeParse({ name: "Семья" }).success).toBe(true);
  });
});

describe("updateUserSettingsSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateUserSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single valid field", () => {
    expect(updateUserSettingsSchema.safeParse({ theme: "dark" }).success).toBe(true);
  });

  it("rejects a theme outside the supported set", () => {
    expect(updateUserSettingsSchema.safeParse({ theme: "solarized" }).success).toBe(false);
  });

  it("validates HH:MM time-of-day fields and allows clearing quiet hours", () => {
    expect(updateUserSettingsSchema.safeParse({ dailyDigestTime: "09:00" }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ dailyDigestTime: "9:00" }).success).toBe(false);
    expect(updateUserSettingsSchema.safeParse({ dailyDigestTime: "24:00" }).success).toBe(false);
    expect(updateUserSettingsSchema.safeParse({ quietHoursStart: null, quietHoursEnd: null }).success).toBe(true);
  });

  it("rejects weekStartsOn outside 0-6", () => {
    expect(updateUserSettingsSchema.safeParse({ weekStartsOn: 7 }).success).toBe(false);
    expect(updateUserSettingsSchema.safeParse({ weekStartsOn: 0 }).success).toBe(true);
  });

  it("rejects a non-UUID defaultWorkspaceId but allows clearing it", () => {
    expect(updateUserSettingsSchema.safeParse({ defaultWorkspaceId: "nope" }).success).toBe(false);
    expect(updateUserSettingsSchema.safeParse({ defaultWorkspaceId: null }).success).toBe(true);
  });
});
