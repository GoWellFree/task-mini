/** Machine-readable error codes. The wire format is defined by `ApiErrorBody`. */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  INTERNAL: "INTERNAL",

  SESSION_INVALID: "SESSION_INVALID",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REUSED: "SESSION_REUSED",

  USER_NOT_FOUND: "USER_NOT_FOUND",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  WORKSPACE_ACCESS_DENIED: "WORKSPACE_ACCESS_DENIED",
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_ACCESS_DENIED: "TASK_ACCESS_DENIED",
  TASK_VERSION_CONFLICT: "TASK_VERSION_CONFLICT",
  INVITE_NOT_FOUND: "INVITE_NOT_FOUND",
  ASSIGNEE_NOT_MEMBER: "ASSIGNEE_NOT_MEMBER",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/** Default user-facing (Russian) message per code; handlers may override. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Проверьте правильность заполнения полей",
  UNAUTHORIZED: "Требуется авторизация",
  FORBIDDEN: "Недостаточно прав",
  RATE_LIMITED: "Слишком много запросов. Попробуйте позже",
  ROUTE_NOT_FOUND: "Маршрут не найден",
  INTERNAL: "Внутренняя ошибка сервера",

  SESSION_INVALID: "Сессия недействительна. Войдите заново",
  SESSION_EXPIRED: "Сессия истекла. Войдите заново",
  SESSION_REUSED: "Сессия завершена по соображениям безопасности. Войдите заново",

  USER_NOT_FOUND: "Пользователь не найден",
  WORKSPACE_NOT_FOUND: "Группа не найдена",
  WORKSPACE_ACCESS_DENIED: "Вы не состоите в этой группе",
  TASK_NOT_FOUND: "Задача не найдена",
  TASK_ACCESS_DENIED: "Нет доступа к этой задаче",
  TASK_VERSION_CONFLICT: "Задача изменена в другом месте. Обновите страницу и попробуйте снова",
  INVITE_NOT_FOUND: "Приглашение не найдено",
  ASSIGNEE_NOT_MEMBER: "Исполнитель должен быть участником группы",
};

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  ROUTE_NOT_FOUND: 404,
  INTERNAL: 500,

  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  SESSION_REUSED: 401,

  USER_NOT_FOUND: 404,
  WORKSPACE_NOT_FOUND: 404,
  WORKSPACE_ACCESS_DENIED: 403,
  TASK_NOT_FOUND: 404,
  TASK_ACCESS_DENIED: 403,
  TASK_VERSION_CONFLICT: 409,
  INVITE_NOT_FOUND: 404,
  ASSIGNEE_NOT_MEMBER: 400,
};
