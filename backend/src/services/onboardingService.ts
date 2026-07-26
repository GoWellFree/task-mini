import { createDefaultSettings } from "../repositories/userSettingsRepository.js";
import { createPersonalWorkspace } from "./workspaceService.js";

/**
 * Runs once for a genuinely new user (the caller is responsible for only
 * invoking this on first creation, not on every login). Failures here are
 * logged, not thrown: a hiccup creating the personal workspace or settings
 * row must not block the user from logging in at all, which would be a far
 * worse outcome than starting with no personal workspace this one time.
 *
 * createPersonalWorkspace already compensates for its own partial failure
 * (see workspaceService.createWorkspaceWithOwner); if THAT succeeds but the
 * settings insert then fails, the user simply has no settings row yet and
 * getSettingsOrDefaults falls back to defaults until they save a preference.
 */
export async function onboardNewUser(userId: string): Promise<void> {
  try {
    const personalWorkspace = await createPersonalWorkspace(userId);
    await createDefaultSettings(userId, personalWorkspace.id);
  } catch (err) {
    console.error(`Onboarding failed for new user ${userId} (personal workspace/settings):`, err);
  }
}
