import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../lib/jwt.js";
import { supabase } from "../lib/supabase.js";
import type { User } from "../types/index.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Отсутствует токен авторизации" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const { data, error } = await supabase.from("users").select("*").eq("id", payload.userId).single();

    if (error || !data) {
      res.status(401).json({ error: "Пользователь не найден" });
      return;
    }

    req.user = data as User;
    next();
  } catch {
    res.status(401).json({ error: "Недействительный или истёкший токен" });
  }
}
