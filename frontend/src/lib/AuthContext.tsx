import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, getRefreshToken, setOnSessionExpired, setTokens } from "./api";
import { getInitData, getStartParam, isRunningInTelegram } from "./telegram";
import type { AuthResponse, User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  startParam: string | null;
  logout: () => void;
  logoutEverywhere: () => void;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startParam, setStartParam] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function authenticate() {
      setLoading(true);
      setError(null);
      try {
        const initData = getInitData();
        const devAuth = !isRunningInTelegram() && import.meta.env.DEV;

        if (!initData && !devAuth) {
          throw new Error("Откройте приложение через Telegram");
        }

        const result = await api.post<AuthResponse>("/api/auth/telegram", initData ? { initData } : { dev: true });

        if (cancelled) return;
        setTokens(result);
        setUser(result.user);
        setStartParam(result.startParam ?? getStartParam() ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Не удалось авторизоваться");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    authenticate();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // A refresh failure means the session is gone server-side (expired, revoked,
  // or reuse detected) — drop the user back to the login screen.
  useEffect(() => {
    setOnSessionExpired(() => {
      setUser(null);
      setError("Сессия истекла. Откройте приложение заново.");
    });
    return () => setOnSessionExpired(null);
  }, []);

  async function logout() {
    const refreshToken = getRefreshToken();
    // Best-effort server-side revocation; the local session goes either way.
    if (refreshToken) {
      await api.post("/api/auth/logout", { refreshToken }).catch(() => {});
    }
    clearTokens();
    setUser(null);
  }

  async function logoutEverywhere() {
    await api.post("/api/auth/logout-all").catch(() => {});
    clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        startParam,
        logout,
        logoutEverywhere,
        retry: () => setAttempt((a) => a + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
