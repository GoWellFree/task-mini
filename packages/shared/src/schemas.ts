import { z } from "zod";
import { PROJECT_STATUS_VALUES, TASK_STATUS_VALUES, THEME_VALUES } from "./enums.js";

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const WORKSPACE_NAME_MAX = 100;
export const PROJECT_NAME_MAX = 100;
export const PROJECT_ICON_MAX = 16;
/** #RGB or #RRGGBB — kept deliberately simple; a swatch picker constrains input anyway. */
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const uuid = z.string().uuid();

/** ISO-8601 timestamp that Postgres/`new Date()` can both round-trip. */
const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Некорректная дата" });

const taskStatus = z.enum(TASK_STATUS_VALUES);

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Укажите название группы").max(WORKSPACE_NAME_MAX),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const createTaskSchema = z.object({
  workspaceId: uuid,
  title: z.string().trim().min(1, "Укажите название задачи").max(TITLE_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  assigneeId: uuid.optional(),
  status: taskStatus.optional(),
  dueAt: isoDateTime.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    // The version the client last read. Required on every PATCH so a write
    // based on stale data is refused (409 TASK_VERSION_CONFLICT) instead of
    // silently overwriting a concurrent edit.
    version: z.number().int().min(1, "Отсутствует версия задачи"),
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
    assigneeId: uuid.nullable().optional(),
    status: taskStatus.optional(),
    dueAt: isoDateTime.nullable().optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== "version"), {
    message: "Нет данных для обновления",
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const telegramAuthSchema = z.object({
  initData: z.string().min(1).optional(),
  dev: z.boolean().optional(),
});
export type TelegramAuthInput = z.infer<typeof telegramAuthSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Отсутствует refresh-токен"),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время в формате ЧЧ:ММ");

export const updateUserSettingsSchema = z
  .object({
    defaultWorkspaceId: uuid.nullable().optional(),
    defaultReminderMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    dailyDigestEnabled: z.boolean().optional(),
    dailyDigestTime: timeOfDay.optional(),
    eveningDigestEnabled: z.boolean().optional(),
    quietHoursStart: timeOfDay.nullable().optional(),
    quietHoursEnd: timeOfDay.nullable().optional(),
    telegramNotificationsEnabled: z.boolean().optional(),
    theme: z.enum(THEME_VALUES).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Нет данных для обновления" });
export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;

const projectStatus = z.enum(PROJECT_STATUS_VALUES);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Укажите название проекта").max(PROJECT_NAME_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  icon: z.string().trim().max(PROJECT_ICON_MAX).optional(),
  color: z.string().regex(HEX_COLOR, "Укажите цвет в формате #RRGGBB").optional(),
  status: projectStatus.optional(),
  startAt: isoDateTime.optional(),
  dueAt: isoDateTime.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(PROJECT_NAME_MAX).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
    icon: z.string().trim().max(PROJECT_ICON_MAX).nullable().optional(),
    color: z.string().regex(HEX_COLOR).nullable().optional(),
    status: projectStatus.optional(),
    startAt: isoDateTime.nullable().optional(),
    dueAt: isoDateTime.nullable().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Нет данных для обновления" });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const uuidParamSchema = z.object({ id: uuid });
export const workspaceIdParamSchema = z.object({ workspaceId: uuid });
