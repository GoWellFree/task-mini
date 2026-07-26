import { Router } from "express";
import {
  ERROR_CODES,
  refreshTokenSchema,
  telegramAuthSchema,
  type RefreshTokenInput,
  type TelegramAuthInput,
} from "@task-mini/shared";
import { env } from "../lib/env.js";
import { ApiError } from "../lib/apiError.js";
import { verifyTelegramInitData } from "../lib/telegramAuth.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { findUserByTelegramId, upsertUserByTelegramId } from "../repositories/userRepository.js";
import {
  createSession,
  listActiveSessions,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from "../services/sessionService.js";
import type { User } from "../types/index.js";

export const authRouter = Router();

async function findOrCreateUser(input: {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}): Promise<User> {
  const existing = await findUserByTelegramId(input.telegram_id);
  if (existing) return existing;

  return upsertUserByTelegramId(input);
}

authRouter.post(
  "/telegram",
  validateBody(telegramAuthSchema),
  asyncHandler(async (req, res) => {
    const { initData, dev } = req.body as TelegramAuthInput;

    const userAgent = req.header("User-Agent");

    // Dev auth path: only available when explicitly enabled and never in production.
    if (dev && env.enableDevAuth) {
      const user = await findOrCreateUser({
        telegram_id: 100000001,
        username: "dev_user",
        first_name: "Dev",
        last_name: "User",
      });
      const tokens = await createSession({
        userId: user.id,
        telegramId: user.telegram_id,
        userAgent,
      });
      res.json({ ...tokens, user });
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

    const tokens = await createSession({
      userId: user.id,
      telegramId: user.telegram_id,
      userAgent,
    });
    res.json({ ...tokens, user, startParam: parsed.startParam });
  }),
);

// POST /api/auth/refresh — exchange a refresh token for a new pair.
// Deliberately unauthenticated: it is called precisely when the access token
// has expired. The refresh token itself is the credential.
authRouter.post(
  "/refresh",
  validateBody(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as RefreshTokenInput;
    const { userId: _userId, ...tokens } = await rotateSession({
      refreshToken,
      userAgent: req.header("User-Agent"),
    });
    res.json(tokens);
  }),
);

// POST /api/auth/logout — revoke this device's refresh token.
authRouter.post(
  "/logout",
  validateBody(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as RefreshTokenInput;
    await revokeSession(refreshToken);
    res.status(204).send();
  }),
);

// POST /api/auth/logout-all — revoke every session for the current user.
authRouter.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeAllSessions(req.user!.id);
    res.status(204).send();
  }),
);

// GET /api/auth/sessions — active sessions for the current user.
authRouter.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessions = await listActiveSessions(req.user!.id);
    res.json({ sessions });
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
