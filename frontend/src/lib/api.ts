import { ERROR_MESSAGES, type ApiErrorBody, type ErrorCode } from "@task-mini/shared";

const API_URL = import.meta.env.VITE_API_URL as string;
const TOKEN_KEY = "task_mini_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
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
