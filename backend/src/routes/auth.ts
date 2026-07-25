import { Router } from "express";
import { ERROR_CODES, telegramAuthSchema, type TelegramAuthInput } from "@task-mini/shared";
import { env } from "../lib/env.js";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import { verifyTelegramInitData } from "../lib/telegramAuth.js";
import { signAuthToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import type { User } from "../types/index.js";

export const authRouter = Router();

async function findOrCreateUser(input: {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}): Promise<User> {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", input.telegram_id)
    .maybeSingle();

  if (existing) {
    return existing as User;
  }

  // Upsert instead of plain insert: if two requests race to create the same
  // telegram_id (e.g. React StrictMode double-invoking the auth call in dev),
  // this resolves the conflict instead of throwing a duplicate-key error.
  const { data: created, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: input.telegram_id,
        username: input.username ?? null,
        first_name: input.first_name,
        last_name: input.last_name ?? null,
      },
      { onConflict: "telegram_id" },
    )
    .select("*")
    .single();

  if (error || !created) {
    throw error ?? new ApiError(ERROR_CODES.INTERNAL, { message: "Не удалось создать пользователя" });
  }

  return created as User;
}

authRouter.post(
  "/telegram",
  validateBody(telegramAuthSchema),
  asyncHandler(async (req, res) => {
    const { initData, dev } = req.body as TelegramAuthInput;

    // Dev auth path: only available when explicitly enabled and never in production.
    if (dev && env.enableDevAuth) {
      const user = await findOrCreateUser({
        telegram_id: 100000001,
        username: "dev_user",
        first_name: "Dev",
        last_name: "User",
      });
      const token = signAuthToken({ userId: user.id, telegramId: user.telegram_id });
      res.json({ token, user });
      return;
    }

    if (!initData) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, { message: "Отсутствуют данные initData" });
    }

    let parsed;
    try {
      parsed = verifyTelegramInitData(initData);
    } catch (err) {
      // Never surface the raw verification message — it distinguishes "bad
      // signature" from "expired", which helps nobody but an attacker.
      console.error(`[${req.requestId}] initData verification failed:`, err);
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, { message: "Не удалось подтвердить данные Telegram" });
    }

    const user = await findOrCreateUser({
      telegram_id: parsed.user.id,
      username: parsed.user.username,
      first_name: parsed.user.first_name,
      last_name: parsed.user.last_name,
    });

    const token = signAuthToken({ userId: user.id, telegramId: user.telegram_id });
    res.json({ token, user, startParam: parsed.startParam });
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
