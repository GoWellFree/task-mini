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
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  PROJECT_ACCESS_DENIED: "PROJECT_ACCESS_DENIED",
  LABEL_NOT_FOUND: "LABEL_NOT_FOUND",
  LABEL_NAME_TAKEN: "LABEL_NAME_TAKEN",
  CHECKLIST_ITEM_NOT_FOUND: "CHECKLIST_ITEM_NOT_FOUND",
  COMMENT_NOT_FOUND: "COMMENT_NOT_FOUND",
  COMMENT_ACCESS_DENIED: "COMMENT_ACCESS_DENIED",
  DEPENDENCY_NOT_FOUND: "DEPENDENCY_NOT_FOUND",
  DEPENDENCY_CYCLE: "DEPENDENCY_CYCLE",
  DEPENDENCY_CROSS_WORKSPACE: "DEPENDENCY_CROSS_WORKSPACE",
  TASK_BLOCKED_BY_DEPENDENCIES: "TASK_BLOCKED_BY_DEPENDENCIES",
  ATTACHMENT_NOT_FOUND: "ATTACHMENT_NOT_FOUND",
  ATTACHMENT_TOO_LARGE: "ATTACHMENT_TOO_LARGE",
  ATTACHMENT_MISSING: "ATTACHMENT_MISSING",
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
  PROJECT_NOT_FOUND: "Проект не найден",
  PROJECT_ACCESS_DENIED: "Нет доступа к этому проекту",
  LABEL_NOT_FOUND: "Метка не найдена",
  LABEL_NAME_TAKEN: "Метка с таким названием уже существует",
  CHECKLIST_ITEM_NOT_FOUND: "Пункт чек-листа не найден",
  COMMENT_NOT_FOUND: "Комментарий не найден",
  COMMENT_ACCESS_DENIED: "Вы можете изменять только свои комментарии",
  DEPENDENCY_NOT_FOUND: "Зависимость не найдена",
  DEPENDENCY_CYCLE: "Это создаст циклическую зависимость между задачами",
  DEPENDENCY_CROSS_WORKSPACE: "Зависимость можно добавить только между задачами одной группы",
  TASK_BLOCKED_BY_DEPENDENCIES: "Сначала выполните задачи, от которых зависит эта",
  ATTACHMENT_NOT_FOUND: "Файл не найден",
  ATTACHMENT_TOO_LARGE: "Файл слишком большой (максимум 15 МБ)",
  ATTACHMENT_MISSING: "Выберите файл для загрузки",
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
  PROJECT_NOT_FOUND: 404,
  PROJECT_ACCESS_DENIED: 403,
  LABEL_NOT_FOUND: 404,
  LABEL_NAME_TAKEN: 409,
  CHECKLIST_ITEM_NOT_FOUND: 404,
  COMMENT_NOT_FOUND: 404,
  COMMENT_ACCESS_DENIED: 403,
  DEPENDENCY_NOT_FOUND: 404,
  DEPENDENCY_CYCLE: 409,
  DEPENDENCY_CROSS_WORKSPACE: 400,
  TASK_BLOCKED_BY_DEPENDENCIES: 409,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_TOO_LARGE: 400,
  ATTACHMENT_MISSING: 400,
};
