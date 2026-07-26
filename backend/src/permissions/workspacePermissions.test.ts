import { beforeEach, describe, expect, it, vi } from "vitest";

interface MembershipRow {
  user_id: string;
  role: string;
}

// The permission service talks to Supabase; stub the client so these tests
// exercise the authorization rules rather than the database. Keyed by
// user_id so a single test can simulate several members with different
// roles at once (e.g. an admin and a viewer in the same workspace).
const state = { membershipByUser: new Map<string, MembershipRow>() };

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    from(table: string) {
      let userIdFilter: string | undefined;
      const builder = {
        select: () => builder,
        eq(column: string, value: string) {
          if (column === "user_id") userIdFilter = value;
          return builder;
        },
        maybeSingle: async () => {
          if (table !== "workspace_members") return { data: null };
          const row = userIdFilter ? state.membershipByUser.get(userIdFilter) : undefined;
          return { data: row ?? null };
        },
      };
      return builder;
    },
  },
}));

const {
  canManageProject,
  canManageTask,
  getTaskEditRights,
  requireAssigneeIsMember,
  requireContributor,
  requireMembership,
  requireProjectManager,
} = await import("./workspacePermissions.js");

const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555";
const CREATOR_ID = "aaaaaaaa-2222-4333-8444-555555555555";
const OWNER_ID = "bbbbbbbb-2222-4333-8444-555555555555";
const ASSIGNEE_ID = "cccccccc-2222-4333-8444-555555555555";
const OUTSIDER_ID = "dddddddd-2222-4333-8444-555555555555";
const ADMIN_ID = "11111111-3333-4333-8444-555555555555";
const VIEWER_ID = "22222222-3333-4333-8444-555555555555";
const MANAGER_ID = "33333333-3333-4333-8444-555555555555";

const task = {
  id: "eeeeeeee-2222-4333-8444-555555555555",
  workspace_id: WORKSPACE_ID,
  creator_id: CREATOR_ID,
  assignee_id: ASSIGNEE_ID,
} as Parameters<typeof canManageTask>[0];

const project = {
  id: "99999999-2222-4333-8444-555555555555",
  workspace_id: WORKSPACE_ID,
  owner_id: CREATOR_ID,
} as Parameters<typeof canManageProject>[0];

beforeEach(() => {
  state.membershipByUser = new Map(
    [
      { user_id: CREATOR_ID, role: "member" },
      { user_id: OWNER_ID, role: "owner" },
      { user_id: ASSIGNEE_ID, role: "member" },
      { user_id: ADMIN_ID, role: "admin" },
      { user_id: VIEWER_ID, role: "viewer" },
      { user_id: MANAGER_ID, role: "manager" },
    ].map((row) => [row.user_id, row]),
  );
  // OUTSIDER_ID is deliberately never added — a non-member.
});

describe("requireMembership", () => {
  it("passes for a member", async () => {
    await expect(requireMembership(WORKSPACE_ID, CREATOR_ID)).resolves.toBeTruthy();
  });

  it("rejects a non-member with WORKSPACE_ACCESS_DENIED", async () => {
    await expect(requireMembership(WORKSPACE_ID, OUTSIDER_ID)).rejects.toMatchObject({
      code: "WORKSPACE_ACCESS_DENIED",
      status: 403,
    });
  });
});

describe("requireContributor", () => {
  it("passes for a member, admin, manager, or owner", async () => {
    await expect(requireContributor(WORKSPACE_ID, CREATOR_ID)).resolves.toBeTruthy();
    await expect(requireContributor(WORKSPACE_ID, ADMIN_ID)).resolves.toBeTruthy();
    await expect(requireContributor(WORKSPACE_ID, MANAGER_ID)).resolves.toBeTruthy();
    await expect(requireContributor(WORKSPACE_ID, OWNER_ID)).resolves.toBeTruthy();
  });

  it("rejects a viewer even though they are a member", async () => {
    await expect(requireContributor(WORKSPACE_ID, VIEWER_ID)).rejects.toMatchObject({
      code: "WORKSPACE_ACCESS_DENIED",
    });
  });

  it("rejects a non-member before role is even considered", async () => {
    await expect(requireContributor(WORKSPACE_ID, OUTSIDER_ID)).rejects.toMatchObject({
      code: "WORKSPACE_ACCESS_DENIED",
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

  it("allows a workspace admin", async () => {
    await expect(canManageTask(task, ADMIN_ID)).resolves.toBe(true);
  });

  it("denies a manager — no distinct scope yet, so it behaves like a plain member", async () => {
    await expect(canManageTask(task, MANAGER_ID)).resolves.toBe(false);
  });

  it("denies a plain member who is neither creator nor owner/admin", async () => {
    await expect(canManageTask(task, ASSIGNEE_ID)).resolves.toBe(false);
  });

  it("denies a viewer", async () => {
    await expect(canManageTask(task, VIEWER_ID)).resolves.toBe(false);
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

  it("grants an admin full management even without being creator or assignee", async () => {
    await expect(getTaskEditRights(task, ADMIN_ID)).resolves.toEqual({
      canManage: true,
      canChangeStatus: true,
    });
  });

  it("rejects a workspace member who is neither manager nor assignee", async () => {
    const otherMemberId = "ffffffff-2222-4333-8444-555555555555";
    state.membershipByUser.set(otherMemberId, { user_id: otherMemberId, role: "member" });
    await expect(getTaskEditRights(task, otherMemberId)).rejects.toMatchObject({
      code: "TASK_ACCESS_DENIED",
    });
  });

  it("rejects a non-member before any task rights are considered", async () => {
    await expect(getTaskEditRights(task, OUTSIDER_ID)).rejects.toMatchObject({
      code: "WORKSPACE_ACCESS_DENIED",
    });
  });
});

describe("requireAssigneeIsMember", () => {
  it("passes for a contributing member", async () => {
    await expect(requireAssigneeIsMember(WORKSPACE_ID, ASSIGNEE_ID)).resolves.toBeUndefined();
  });

  it("rejects a viewer — assigning work to a read-only role makes no sense", async () => {
    await expect(requireAssigneeIsMember(WORKSPACE_ID, VIEWER_ID)).rejects.toMatchObject({
      code: "ASSIGNEE_NOT_MEMBER",
    });
  });

  it("rejects a non-member", async () => {
    await expect(requireAssigneeIsMember(WORKSPACE_ID, OUTSIDER_ID)).rejects.toMatchObject({
      code: "ASSIGNEE_NOT_MEMBER",
    });
  });
});

describe("canManageProject / requireProjectManager", () => {
  it("allows the project owner", async () => {
    await expect(canManageProject(project, CREATOR_ID)).resolves.toBe(true);
  });

  it("allows the workspace owner even if they didn't create the project", async () => {
    await expect(canManageProject(project, OWNER_ID)).resolves.toBe(true);
  });

  it("allows a workspace admin", async () => {
    await expect(canManageProject(project, ADMIN_ID)).resolves.toBe(true);
  });

  it("denies a plain member who doesn't own the project", async () => {
    await expect(canManageProject(project, ASSIGNEE_ID)).resolves.toBe(false);
  });

  it("requireProjectManager throws PROJECT_ACCESS_DENIED for a non-manager", async () => {
    await expect(requireProjectManager(project, ASSIGNEE_ID)).rejects.toMatchObject({
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("requireProjectManager resolves silently for the owner", async () => {
    await expect(requireProjectManager(project, CREATOR_ID)).resolves.toBeUndefined();
  });
});
