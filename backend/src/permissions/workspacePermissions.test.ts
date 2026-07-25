import { beforeEach, describe, expect, it, vi } from "vitest";

// The permission service talks to Supabase; stub the client so these tests
// exercise the authorization rules rather than the database.
const state = {
  membership: null as { role: string } | null,
  workspaceOwnerId: null as string | null,
};

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    from(table: string) {
      const result =
        table === "workspace_members"
          ? state.membership
          : table === "workspaces"
            ? state.workspaceOwnerId
              ? { owner_id: state.workspaceOwnerId }
              : null
            : null;

      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: result }),
      };
      return builder;
    },
  },
}));

const { canManageTask, getTaskEditRights, requireMembership } = await import("./workspacePermissions.js");

const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555";
const CREATOR_ID = "aaaaaaaa-2222-4333-8444-555555555555";
const OWNER_ID = "bbbbbbbb-2222-4333-8444-555555555555";
const ASSIGNEE_ID = "cccccccc-2222-4333-8444-555555555555";
const OUTSIDER_ID = "dddddddd-2222-4333-8444-555555555555";

const task = {
  id: "eeeeeeee-2222-4333-8444-555555555555",
  workspace_id: WORKSPACE_ID,
  creator_id: CREATOR_ID,
  assignee_id: ASSIGNEE_ID,
} as Parameters<typeof canManageTask>[0];

beforeEach(() => {
  state.membership = { role: "member" };
  state.workspaceOwnerId = OWNER_ID;
});

describe("requireMembership", () => {
  it("passes for a member", async () => {
    await expect(requireMembership(WORKSPACE_ID, CREATOR_ID)).resolves.toBeTruthy();
  });

  it("rejects a non-member with WORKSPACE_ACCESS_DENIED", async () => {
    state.membership = null;
    await expect(requireMembership(WORKSPACE_ID, OUTSIDER_ID)).rejects.toMatchObject({
      code: "WORKSPACE_ACCESS_DENIED",
      status: 403,
    });
  });
});

describe("canManageTask", () => {
  it("allows the task creator", async () => {
    await expect(canManageTask(task, CREATOR_ID)).resolves.toBe(true);
  });

  it("allows the workspace owner", async () => {
    await expect(canManageTask(task, OWNER_ID)).resolves.toBe(true);
  });

  it("denies a plain member who is neither creator nor owner", async () => {
    await expect(canManageTask(task, ASSIGNEE_ID)).resolves.toBe(false);
  });
});

describe("getTaskEditRights", () => {
  it("grants full management to the creator", async () => {
    await expect(getTaskEditRights(task, CREATOR_ID)).resolves.toEqual({
      canManage: true,
      canChangeStatus: true,
    });
  });

  it("grants the assignee status-only rights", async () => {
    await expect(getTaskEditRights(task, ASSIGNEE_ID)).resolves.toEqual({
      canManage: false,
      canChangeStatus: true,
    });
  });

  it("rejects a workspace member who is neither manager nor assignee", async () => {
    const otherMemberId = "ffffffff-2222-4333-8444-555555555555";
    await expect(getTaskEditRights(task, otherMemberId)).rejects.toMatchObject({
      code: "TASK_ACCESS_DENIED",
    });
  });

  it("rejects a non-member before any task rights are considered", async () => {
    state.membership = null;
    await expect(getTaskEditRights(task, OUTSIDER_ID)).rejects.toMatchObject({
      code: "WORKSPACE_ACCESS_DENIED",
    });
  });
});
