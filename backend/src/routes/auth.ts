import { Router } from "express";
import { env } from "../lib/env.js";
import { supabase } from "../lib/supabase.js";
import { verifyTelegramInitData } from "../lib/telegramAuth.js";
import { signAuthToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
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
    throw new Error(error?.message ?? "Не удалось создать пользователя");
  }

  return created as User;
}

authRouter.post("/telegram", async (req, res) => {
  try {
    const { initData, dev } = req.body as { initData?: string; dev?: boolean };

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
      res.status(400).json({ error: "Отсутствуют данные initData" });
      return;
    }

    const parsed = verifyTelegramInitData(initData);
    const user = await findOrCreateUser({
      telegram_id: parsed.user.id,
      username: parsed.user.username,
      first_name: parsed.user.first_name,
      last_name: parsed.user.last_name,
    });

    const token = signAuthToken({ userId: user.id, telegramId: user.telegram_id });
    res.json({ token, user, startParam: parsed.startParam });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : "Ошибка авторизации" });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
