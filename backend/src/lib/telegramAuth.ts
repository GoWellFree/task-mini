import crypto from "node:crypto";
import { env } from "./env.js";

export interface TelegramInitDataUser {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}

export interface ParsedInitData {
  user: TelegramInitDataUser;
  startParam?: string;
  authDate: number;
}

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60; // 24h

/**
 * Verifies the `initData` string Telegram Mini Apps send on launch.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData: string): ParsedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("initData is missing hash");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    throw new Error("Invalid Telegram initData signature");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error("Telegram initData has expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new Error("initData is missing user");
  }

  const user = JSON.parse(userRaw) as TelegramInitDataUser;

  return {
    user,
    startParam: params.get("start_param") ?? undefined,
    authDate,
  };
}
