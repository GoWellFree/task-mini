import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./telegram", () => ({ getInitData: vi.fn(() => "mock-init-data") }));

import { getInitData } from "./telegram";
import { api, clearTokens, getRefreshToken, getToken, setOnSessionExpired, setTokens } from "./api";

const API_URL = import.meta.env.VITE_API_URL as string;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getInitData).mockReturnValue("mock-init-data");
  setOnSessionExpired(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("token storage", () => {
  it("round-trips through localStorage", () => {
    setTokens({ accessToken: "a1", refreshToken: "r1" });
    expect(getToken()).toBe("a1");
    expect(getRefreshToken()).toBe("r1");
    clearTokens();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("falls back to an in-memory copy when localStorage throws", () => {
    // Regression case: some Telegram WebView contexts have been observed to
    // not reliably expose a working localStorage. Without the in-memory
    // fallback, a request made right after login would find no token at all
    // and fail with "missing auth token" even though login just succeeded.
    setTokens({ accessToken: "a1", refreshToken: "r1" });

    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(getToken()).toBe("a1");
    expect(getRefreshToken()).toBe("r1");

    getItemSpy.mockRestore();
  });
});

describe("request() 401 recovery", () => {
  it("refreshes and retries when a refresh token is available", async () => {
    setTokens({ accessToken: "expired", refreshToken: "r1" });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x", requestId: "1" } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh", refreshToken: "r2" }))
      .mockResolvedValueOnce(jsonResponse(200, { workspaces: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ workspaces: unknown[] }>("/api/workspaces");

    expect(result).toEqual({ workspaces: [] });
    expect(getToken()).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toBe(`${API_URL}/api/auth/refresh`);
    // The retried request must carry the NEW token, not the expired one.
    expect((fetchMock.mock.calls[2]![1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fresh",
    });
  });

  it("falls back to a fresh Telegram login when there is no refresh token to try", async () => {
    // This is the exact bug reported in production: a request went out with
    // no token at all (nothing in storage yet, or lost after a reload), so
    // there was no refresh token either. Previously this case wasn't
    // recovered at all — the request just failed and stayed failed, which
    // is why "Отсутствует токен авторизации" showed up on the Workspaces
    // page and left CreateTask's workspace list permanently empty.
    clearTokens();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x", requestId: "1" } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh", refreshToken: "r-new", user: { id: "u1" } }))
      .mockResolvedValueOnce(jsonResponse(200, { workspaces: [{ id: "ws1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ workspaces: unknown[] }>("/api/workspaces");

    expect(result).toEqual({ workspaces: [{ id: "ws1" }] });
    expect(getToken()).toBe("fresh");
    expect(getRefreshToken()).toBe("r-new");
    expect(fetchMock.mock.calls[1]![0]).toBe(`${API_URL}/api/auth/telegram`);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      initData: "mock-init-data",
    });
  });

  it("gives up and reports session-expired only after both recovery paths fail", async () => {
    setTokens({ accessToken: "expired", refreshToken: "r1" });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x", requestId: "1" } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "SESSION_INVALID", message: "x", requestId: "2" } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x", requestId: "3" } }));
    vi.stubGlobal("fetch", fetchMock);

    const onSessionExpired = vi.fn();
    setOnSessionExpired(onSessionExpired);

    await expect(api.get("/api/workspaces")).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(3); // original + refresh attempt + reauthenticate attempt
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
  });

  it("still reports session-expired if a recovery attempt throws outright (network failure)", async () => {
    // Distinct from the above: this exercises an exception, not just a
    // non-ok response — the two paths use separate try/catch in recoverAuth
    // specifically so one throwing can't skip cleanup for the other.
    // ensureRecovered() fully contains its own failures (that's the point —
    // one bad recovery attempt must not blow up the original request), so
    // the original 401's own body is what the caller ultimately sees.
    setTokens({ accessToken: "expired", refreshToken: "r1" });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "original 401", requestId: "1" } }))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockRejectedValueOnce(new TypeError("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const onSessionExpired = vi.fn();
    setOnSessionExpired(onSessionExpired);

    await expect(api.get("/api/workspaces")).rejects.toMatchObject({ status: 401, message: "original 401" });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
  });

  it("does not attempt recovery for a 401 from the auth endpoints themselves", async () => {
    clearTokens();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "bad login", requestId: "1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.post("/api/auth/telegram", { initData: "x" })).rejects.toMatchObject({
      status: 401,
      message: "bad login",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one recovery attempt across concurrent 401s", async () => {
    clearTokens();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x", requestId: "1" } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "x", requestId: "2" } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh", refreshToken: "r-new", user: { id: "u1" } }))
      .mockResolvedValueOnce(jsonResponse(200, { a: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { b: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([api.get<{ a: number }>("/api/a"), api.get<{ b: number }>("/api/b")]);

    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    // 2 failed originals + exactly 1 shared re-login + 2 retries = 5, never 6.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
