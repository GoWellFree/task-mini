import { ERROR_MESSAGES, type ApiErrorBody, type AuthTokens, type ErrorCode } from "@task-mini/shared";

const API_URL = import.meta.env.VITE_API_URL as string;
const ACCESS_TOKEN_KEY = "task_mini_token";
const REFRESH_TOKEN_KEY = "task_mini_refresh_token";

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: Pick<AuthTokens, "accessToken" | "refreshToken">): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  readonly code: ErrorCode | undefined;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(message: string, options: { code?: ErrorCode; status: number; requestId?: string }) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

/** Called when refreshing fails, so the app can drop back to the login screen. */
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// Concurrent 401s must not each fire their own refresh: the first rotation
// would invalidate the token the others are still holding, which the backend
// treats as reuse and punishes by revoking every session. So all callers wait
// on one shared refresh.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    onSessionExpired?.();
    return false;
  }

  setTokens((await response.json()) as AuthTokens);
  return true;
}

function ensureRefreshed(): Promise<boolean> {
  refreshInFlight ??= refreshTokens()
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function send(path: string, options: RequestInit): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_URL}${path}`, { ...options, headers });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await send(path, options);

    // Access tokens are short-lived; transparently refresh once and retry.
    if (response.status === 401 && getRefreshToken() && !path.startsWith("/api/auth/")) {
      if (await ensureRefreshed()) {
        response = await send(path, options);
      }
    }
  } catch {
    // Network-level failure (offline, DNS, CORS): no HTTP status exists.
    throw new ApiError("Нет связи с сервером. Проверьте подключение.", { status: 0 });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as (ApiErrorBody & Record<string, unknown>) | null;

  if (!response.ok) {
    const details = body?.error;
    throw new ApiError(details?.message ?? ERROR_MESSAGES.INTERNAL, {
      code: details?.code,
      status: response.status,
      requestId: details?.requestId,
    });
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
