import { ERROR_MESSAGES, type ApiErrorBody, type AuthTokens, type ErrorCode } from "@task-mini/shared";
import { getInitData } from "./telegram";

const API_URL = import.meta.env.VITE_API_URL as string;
const ACCESS_TOKEN_KEY = "task_mini_token";
const REFRESH_TOKEN_KEY = "task_mini_refresh_token";

// Some Telegram WebView contexts have been observed to not reliably persist
// localStorage (writes appear to succeed but a subsequent read in the same
// page life returns nothing) or to disallow it outright. An in-memory
// fallback keeps the current page functional either way; only an actual
// reload would lose it, and that case is handled by reauthenticate() below.
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignored — the in-memory copy set alongside this call still works.
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignored — nothing further to clean up if storage isn't usable.
  }
}

export function getToken(): string | null {
  return safeGetItem(ACCESS_TOKEN_KEY) ?? memoryAccessToken;
}

export function getRefreshToken(): string | null {
  return safeGetItem(REFRESH_TOKEN_KEY) ?? memoryRefreshToken;
}

export function setTokens(tokens: Pick<AuthTokens, "accessToken" | "refreshToken">): void {
  memoryAccessToken = tokens.accessToken;
  memoryRefreshToken = tokens.refreshToken;
  safeSetItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  safeSetItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  memoryAccessToken = null;
  memoryRefreshToken = null;
  safeRemoveItem(ACCESS_TOKEN_KEY);
  safeRemoveItem(REFRESH_TOKEN_KEY);
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

/** Called when every recovery path below has failed, so the app can drop back to the login screen. */
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return false;

  setTokens((await response.json()) as AuthTokens);
  return true;
}

/**
 * Re-runs the Telegram login from scratch. Telegram hands the WebView fresh
 * initData on every launch regardless of what our own storage remembers, so
 * this recovers a session even when localStorage never held a token to begin
 * with (observed on some devices right after opening via a deep link) —
 * cases a refresh-token retry can't help with, since there was never a
 * refresh token either.
 */
async function reauthenticate(): Promise<boolean> {
  const initData = getInitData();
  const devAuth = !initData && import.meta.env.DEV;
  if (!initData && !devAuth) return false;

  const response = await fetch(`${API_URL}/api/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(initData ? { initData } : { dev: true }),
  });
  if (!response.ok) return false;

  setTokens((await response.json()) as AuthTokens);
  return true;
}

// Concurrent 401s must not each fire their own recovery: two simultaneous
// refreshes would race (the first rotation invalidates the token the second
// is still holding, which the backend treats as reuse and revokes every
// session for it), and two simultaneous re-logins are simply wasted work. So
// every caller waits on one shared attempt.
let recoveryInFlight: Promise<boolean> | null = null;

async function recoverAuth(): Promise<boolean> {
  // Each attempt is isolated: a thrown error (network failure) from one must
  // not skip the other, and both must still reach the cleanup below rather
  // than leaving onSessionExpired uncalled and stale tokens in place.
  try {
    if (await refreshTokens()) return true;
  } catch {
    /* fall through to reauthenticate */
  }

  try {
    if (await reauthenticate()) return true;
  } catch {
    /* fall through to giving up */
  }

  clearTokens();
  onSessionExpired?.();
  return false;
}

function ensureRecovered(): Promise<boolean> {
  recoveryInFlight ??= recoverAuth()
    .catch(() => false)
    .finally(() => {
      recoveryInFlight = null;
    });
  return recoveryInFlight;
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

    // Access tokens are short-lived; transparently recover once and retry.
    // /api/auth/* is excluded because a 401 from those endpoints IS the
    // outcome (bad login, invalid refresh token), not a stale-token symptom.
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      if (await ensureRecovered()) {
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
