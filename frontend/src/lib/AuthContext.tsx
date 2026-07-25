import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, setToken } from "./api";
import { getInitData, getStartParam, isRunningInTelegram } from "./telegram";
import type { User } from "../types";

interface AuthResponse {
  token: string;
  user: User;
  startParam?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  startParam: string | null;
  logout: () => void;
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
        setToken(result.token);
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

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, error, startParam, logout, retry: () => setAttempt((a) => a + 1) }}
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
