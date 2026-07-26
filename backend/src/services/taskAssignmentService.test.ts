import { beforeEach, describe, expect, it, vi } from "vitest";

const assigneeRepo = vi.hoisted(() => ({
  clearAssignees: vi.fn(),
  addAssignee: vi.fn(),
  removeAssignee: vi.fn(),
  listAssigneeIds: vi.fn(),
}));
const taskRepo = vi.hoisted(() => ({ setAssigneeId: vi.fn() }));

vi.mock("../repositories/taskAssigneeRepository.js", () => assigneeRepo);
vi.mock("../repositories/taskRepository.js", () => taskRepo);

const { addAssignee, removeAssignee, setSingleAssignee } = await import("./taskAssignmentService.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setSingleAssignee", () => {
  it("clears any existing assignees, adds the one given, and mirrors it to assignee_id", async () => {
    await setSingleAssignee("task-1", "user-2", "user-1");

    expect(assigneeRepo.clearAssignees).toHaveBeenCalledWith("task-1");
    expect(assigneeRepo.addAssignee).toHaveBeenCalledWith("task-1", "user-2", "user-1");
    expect(taskRepo.setAssigneeId).toHaveBeenCalledWith("task-1", "user-2");
  });

  it("clearing to null removes everyone and mirrors null", async () => {
    await setSingleAssignee("task-1", null, "user-1");

    expect(assigneeRepo.clearAssignees).toHaveBeenCalledWith("task-1");
    expect(assigneeRepo.addAssignee).not.toHaveBeenCalled();
    expect(taskRepo.setAssigneeId).toHaveBeenCalledWith("task-1", null);
  });
});

describe("addAssignee", () => {
  it("mirrors to assignee_id when this is the first assignee", async () => {
    assigneeRepo.listAssigneeIds.mockResolvedValue(["user-2"]);

    await addAssignee("task-1", "user-2", "user-1");

    expect(assigneeRepo.addAssignee).toHaveBeenCalledWith("task-1", "user-2", "user-1");
    expect(taskRepo.setAssigneeId).toHaveBeenCalledWith("task-1", "user-2");
  });

  it("does not touch assignee_id when someone was already assigned", async () => {
    // A second assignee joins an already-assigned task — the legacy single
    // field already points at someone real; adding another shouldn't churn it.
    assigneeRepo.listAssigneeIds.mockResolvedValue(["user-2", "user-3"]);

    await addAssignee("task-1", "user-3", "user-1");

    expect(taskRepo.setAssigneeId).not.toHaveBeenCalled();
  });
});

describe("removeAssignee", () => {
  it("reassigns assignee_id to a remaining assignee when the removed user held it", async () => {
    assigneeRepo.listAssigneeIds.mockResolvedValue(["user-3"]);

    await removeAssignee("task-1", "user-2", "user-2");

    expect(assigneeRepo.removeAssignee).toHaveBeenCalledWith("task-1", "user-2");
    expect(taskRepo.setAssigneeId).toHaveBeenCalledWith("task-1", "user-3");
  });

  it("clears assignee_id to null when the removed user held it and nobody remains", async () => {
    assigneeRepo.listAssigneeIds.mockResolvedValue([]);

    await removeAssignee("task-1", "user-2", "user-2");

    expect(taskRepo.setAssigneeId).toHaveBeenCalledWith("task-1", null);
  });

  it("leaves assignee_id untouched when removing someone who wasn't the primary assignee", async () => {
    await removeAssignee("task-1", "user-3", "user-2");

    expect(assigneeRepo.removeAssignee).toHaveBeenCalledWith("task-1", "user-3");
    expect(taskRepo.setAssigneeId).not.toHaveBeenCalled();
    expect(assigneeRepo.listAssigneeIds).not.toHaveBeenCalled();
  });
});
