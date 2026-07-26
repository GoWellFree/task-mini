import { Router } from "express";
import { updateUserSettingsSchema, type UpdateUserSettingsInput } from "@task-mini/shared";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { getSettingsOrDefaults, upsertSettings } from "../repositories/userSettingsRepository.js";
import type { UserSettings } from "../types/index.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

type SettingsPatch = Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>;

function toColumnPatch(body: UpdateUserSettingsInput): SettingsPatch {
  const patch: SettingsPatch = {};
  if (body.defaultWorkspaceId !== undefined) patch.default_workspace_id = body.defaultWorkspaceId;
  if (body.defaultReminderMinutes !== undefined) patch.default_reminder_minutes = body.defaultReminderMinutes;
  if (body.weekStartsOn !== undefined) patch.week_starts_on = body.weekStartsOn;
  if (body.dailyDigestEnabled !== undefined) patch.daily_digest_enabled = body.dailyDigestEnabled;
  if (body.dailyDigestTime !== undefined) patch.daily_digest_time = body.dailyDigestTime;
  if (body.eveningDigestEnabled !== undefined) patch.evening_digest_enabled = body.eveningDigestEnabled;
  if (body.quietHoursStart !== undefined) patch.quiet_hours_start = body.quietHoursStart;
  if (body.quietHoursEnd !== undefined) patch.quiet_hours_end = body.quietHoursEnd;
  if (body.telegramNotificationsEnabled !== undefined) {
    patch.telegram_notifications_enabled = body.telegramNotificationsEnabled;
  }
  if (body.theme !== undefined) patch.theme = body.theme;
  return patch;
}

// GET /api/users/me/settings
usersRouter.get(
  "/me/settings",
  asyncHandler(async (req, res) => {
    const settings = await getSettingsOrDefaults(req.user!.id);
    res.json({ settings });
  }),
);

// PATCH /api/users/me/settings
usersRouter.patch(
  "/me/settings",
  validateBody(updateUserSettingsSchema),
  asyncHandler(async (req, res) => {
    const patch = toColumnPatch(req.body as UpdateUserSettingsInput);
    const settings = await upsertSettings(req.user!.id, patch);
    res.json({ settings });
  }),
);
