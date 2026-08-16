import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  addMember: vi.fn(),
  deleteWorkspace: vi.fn(),
  findPersonalWorkspaceByOwner: vi.fn(),
}));

vi.mock("../repositories/workspaceRepository.js", () => repo);

const { createWorkspaceWithOwner, createPersonalWorkspace } = await import("./workspaceService.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createWorkspaceWithOwner", () => {
  it("creates the workspace and adds the owner as a member", async () => {
    repo.createWorkspace.mockResolvedValue({ id: "ws-1", name: "Семья", owner_id: "user-1" });
    repo.addMember.mockResolvedValue(undefined);

    const workspace = await createWorkspaceWithOwner("Семья", "user-1");

    expect(workspace).toMatchObject({ id: "ws-1" });
    expect(repo.addMember).toHaveBeenCalledWith("ws-1", "user-1", "owner");
    expect(repo.deleteWorkspace).not.toHaveBeenCalled();
  });

  it("defaults to type 'team' when the caller doesn't specify one", async () => {
    repo.createWorkspace.mockResolvedValue({ id: "ws-1", name: "Работа", owner_id: "user-1" });
    repo.addMember.mockResolvedValue(undefined);

    await createWorkspaceWithOwner("Работа", "user-1");

    expect(repo.createWorkspace).toHaveBeenCalledWith("Работа", "user-1", expect.any(String), "team");
  });

  it("deletes the just-created workspace if the owner membership insert fails", async () => {
    // Regression test: the original inline route code left the workspace
    // row behind in exactly this case, creating a workspace with no owner
    // membership — which every read rejects as WORKSPACE_ACCESS_DENIED,
    // making it permanently invisible and inaccessible to everyone,
    // including the user who "created" it.
    repo.createWorkspace.mockResolvedValue({ id: "ws-1", name: "Семья", owner_id: "user-1" });
    repo.addMember.mockRejectedValue(new Error("membership insert failed"));
    repo.deleteWorkspace.mockResolvedValue(undefined);

    await expect(createWorkspaceWithOwner("Семья", "user-1")).rejects.toThrow("membership insert failed");
    expect(repo.deleteWorkspace).toHaveBeenCalledWith("ws-1");
  });

  it("still surfaces the original error even if the compensating delete also fails", async () => {
    // The delete failure is logged, not thrown — the caller cares that the
    // membership insert failed, not about our best-effort cleanup attempt.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    repo.createWorkspace.mockResolvedValue({ id: "ws-1", name: "Семья", owner_id: "user-1" });
    repo.addMember.mockRejectedValue(new Error("membership insert failed"));
    repo.deleteWorkspace.mockRejectedValue(new Error("delete also failed"));

    await expect(createWorkspaceWithOwner("Семья", "user-1")).rejects.toThrow("membership insert failed");
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe("createPersonalWorkspace", () => {
  it("creates a type='personal' workspace owned by the user", async () => {
    repo.createWorkspace.mockResolvedValue({ id: "ws-personal", owner_id: "user-1", type: "personal" });
    repo.addMember.mockResolvedValue(undefined);

    const workspace = await createPersonalWorkspace("user-1");

    expect(workspace).toMatchObject({ id: "ws-personal" });
    expect(repo.createWorkspace).toHaveBeenCalledWith(
      expect.any(String),
      "user-1",
      expect.any(String),
      "personal",
    );
    expect(repo.addMember).toHaveBeenCalledWith("ws-personal", "user-1", "owner");
  });

  it("returns the winner's workspace instead of erroring when a concurrent request already created one", async () => {
    // Regression test: two concurrent /api/auth/telegram calls for the same
    // brand-new user can both reach onboardNewUser -> createPersonalWorkspace
    // before either commits (see migration 014). The loser's insert hits the
    // one-personal-workspace-per-owner unique index and must recover by
    // fetching what the winner created, not by surfacing a 500.
    const uniqueViolation = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    repo.createWorkspace.mockRejectedValue(uniqueViolation);
    repo.findPersonalWorkspaceByOwner.mockResolvedValue({ id: "ws-winner", owner_id: "user-1", type: "personal" });

    const workspace = await createPersonalWorkspace("user-1");

    expect(workspace).toMatchObject({ id: "ws-winner" });
    expect(repo.findPersonalWorkspaceByOwner).toHaveBeenCalledWith("user-1");
    expect(repo.addMember).not.toHaveBeenCalled();
  });

  it("still throws a unique-violation if no existing personal workspace can be found (shouldn't happen, but don't swallow silently)", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });
    repo.createWorkspace.mockRejectedValue(uniqueViolation);
    repo.findPersonalWorkspaceByOwner.mockResolvedValue(null);

    await expect(createPersonalWorkspace("user-1")).rejects.toThrow("duplicate key value violates unique constraint");
  });

  it("still throws other, non-unique-violation errors normally", async () => {
    repo.createWorkspace.mockRejectedValue(new Error("db unavailable"));

    await expect(createPersonalWorkspace("user-1")).rejects.toThrow("db unavailable");
    expect(repo.findPersonalWorkspaceByOwner).not.toHaveBeenCalled();
  });
});
