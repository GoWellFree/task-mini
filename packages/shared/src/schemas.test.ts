import { describe, expect, it } from "vitest";
import {
  createChecklistItemSchema,
  createLabelSchema,
  createProjectSchema,
  createTaskSchema,
  createWorkspaceSchema,
  updateChecklistItemSchema,
  updateLabelSchema,
  updateProjectSchema,
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

  it("accepts a valid priority and rejects one outside the supported set", () => {
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", priority: "urgent" }).success).toBe(
      true,
    );
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", priority: "critical" }).success).toBe(
      false,
    );
  });

  it("rejects a negative or absurdly large estimate", () => {
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", estimateMinutes: -1 }).success).toBe(
      false,
    );
    expect(
      createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", estimateMinutes: 60 * 24 * 365 }).success,
    ).toBe(false);
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", estimateMinutes: 90 }).success).toBe(
      true,
    );
  });

  it("accepts optional projectId/parentTaskId as UUIDs", () => {
    expect(
      createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", projectId: VALID_UUID }).success,
    ).toBe(true);
    expect(createTaskSchema.safeParse({ workspaceId: VALID_UUID, title: "x", projectId: "nope" }).success).toBe(
      false,
    );
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

  it("allows archiving/unarchiving independently of status", () => {
    expect(updateTaskSchema.safeParse({ version: 1, archived: true }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ version: 1, archived: false }).success).toBe(true);
  });

  it("allows clearing projectId and parentTaskId", () => {
    expect(updateTaskSchema.safeParse({ version: 1, projectId: null, parentTaskId: null }).success).toBe(true);
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

describe("createProjectSchema", () => {
  it("accepts a minimal valid project", () => {
    expect(createProjectSchema.safeParse({ name: "Ремонт кухни" }).success).toBe(true);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createProjectSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a status outside the supported set", () => {
    expect(createProjectSchema.safeParse({ name: "x", status: "done" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "x", status: "active" }).success).toBe(true);
  });

  it("validates the color as a hex code", () => {
    expect(createProjectSchema.safeParse({ name: "x", color: "#3B82F6" }).success).toBe(true);
    expect(createProjectSchema.safeParse({ name: "x", color: "#3B8" }).success).toBe(true);
    expect(createProjectSchema.safeParse({ name: "x", color: "blue" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "x", color: "3B82F6" }).success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });

  it("allows archiving via status alone", () => {
    expect(updateProjectSchema.safeParse({ status: "archived" }).success).toBe(true);
  });

  it("allows clearing optional fields", () => {
    const result = updateProjectSchema.safeParse({ description: null, icon: null, color: null, dueAt: null });
    expect(result.success).toBe(true);
  });

  it("rejects a negative position", () => {
    expect(updateProjectSchema.safeParse({ position: -1 }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ position: 0 }).success).toBe(true);
  });
});

describe("createLabelSchema", () => {
  it("accepts a name-only label", () => {
    expect(createLabelSchema.safeParse({ name: "Срочно" }).success).toBe(true);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createLabelSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createLabelSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("validates the color as a hex code when given", () => {
    expect(createLabelSchema.safeParse({ name: "x", color: "#FF0000" }).success).toBe(true);
    expect(createLabelSchema.safeParse({ name: "x", color: "red" }).success).toBe(false);
  });
});

describe("updateLabelSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateLabelSchema.safeParse({}).success).toBe(false);
  });

  it("allows clearing the color", () => {
    expect(updateLabelSchema.safeParse({ color: null }).success).toBe(true);
  });

  it("accepts a rename alone", () => {
    expect(updateLabelSchema.safeParse({ name: "Не срочно" }).success).toBe(true);
  });
});

describe("createChecklistItemSchema", () => {
  it("accepts a non-empty title", () => {
    expect(createChecklistItemSchema.safeParse({ title: "Купить муку" }).success).toBe(true);
  });

  it("rejects an empty or whitespace-only title", () => {
    expect(createChecklistItemSchema.safeParse({ title: "" }).success).toBe(false);
    expect(createChecklistItemSchema.safeParse({ title: "   " }).success).toBe(false);
  });
});

describe("updateChecklistItemSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateChecklistItemSchema.safeParse({}).success).toBe(false);
  });

  it("accepts toggling isDone alone", () => {
    expect(updateChecklistItemSchema.safeParse({ isDone: true }).success).toBe(true);
  });

  it("rejects a negative position", () => {
    expect(updateChecklistItemSchema.safeParse({ position: -1 }).success).toBe(false);
  });
});
