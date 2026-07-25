import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "@task-mini/shared";
import { verifyAuthToken } from "../lib/jwt.js";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import type { User } from "../types/index.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new ApiError(ERROR_CODES.UNAUTHORIZED, { message: "Отсутствует токен авторизации" }));
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const { data } = await supabase.from("users").select("*").eq("id", payload.userId).maybeSingle();

    if (!data) {
      next(new ApiError(ERROR_CODES.UNAUTHORIZED, { message: "Пользователь не найден" }));
      return;
    }

    req.user = data as User;
    next();
  } catch {
    next(new ApiError(ERROR_CODES.UNAUTHORIZED, { message: "Недействительный или истёкший токен" }));
  }
}
