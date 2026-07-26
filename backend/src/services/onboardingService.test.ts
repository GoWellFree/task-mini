import { beforeEach, describe, expect, it, vi } from "vitest";

const workspaceService = vi.hoisted(() => ({ createPersonalWorkspace: vi.fn() }));
const settingsRepo = vi.hoisted(() => ({ createDefaultSettings: vi.fn() }));

vi.mock("./workspaceService.js", () => workspaceService);
vi.mock("../repositories/userSettingsRepository.js", () => settingsRepo);

const { onboardNewUser } = await import("./onboardingService.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("onboardNewUser", () => {
  it("creates a personal workspace and a settings row pointing at it", async () => {
    workspaceService.createPersonalWorkspace.mockResolvedValue({ id: "ws-personal" });
    settingsRepo.createDefaultSettings.mockResolvedValue(undefined);

    await onboardNewUser("user-1");

    expect(workspaceService.createPersonalWorkspace).toHaveBeenCalledWith("user-1");
    expect(settingsRepo.createDefaultSettings).toHaveBeenCalledWith("user-1", "ws-personal");
  });

  it("never throws — a failure here must not block login", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    workspaceService.createPersonalWorkspace.mockRejectedValue(new Error("db unavailable"));

    await expect(onboardNewUser("user-1")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("still logs if the workspace succeeds but the settings insert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    workspaceService.createPersonalWorkspace.mockResolvedValue({ id: "ws-personal" });
    settingsRepo.createDefaultSettings.mockRejectedValue(new Error("insert failed"));

    await expect(onboardNewUser("user-1")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
