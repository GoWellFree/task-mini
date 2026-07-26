import { z } from "zod";
import { TASK_STATUS_VALUES } from "./enums.js";

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;
export const WORKSPACE_NAME_MAX = 100;

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

export const uuidParamSchema = z.object({ id: uuid });
export const workspaceIdParamSchema = z.object({ workspaceId: uuid });
