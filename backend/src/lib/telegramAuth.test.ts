import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "./telegramAuth.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN as string;

function buildInitData(overrides: { authDate?: number; user?: object; startParam?: string } = {}): string {
  const authDate = overrides.authDate ?? Math.floor(Date.now() / 1000);
  const user = overrides.user ?? { id: 42, first_name: "Test" };

  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));
  if (overrides.startParam) params.set("start_param", overrides.startParam);

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);

  return params.toString();
}

describe("verifyTelegramInitData", () => {
  it("accepts a validly signed, fresh initData string", () => {
    const result = verifyTelegramInitData(buildInitData({ startParam: "task_123" }));
    expect(result.user.id).toBe(42);
    expect(result.startParam).toBe("task_123");
  });

  it("rejects a payload tampered with after signing", () => {
    const params = new URLSearchParams(buildInitData());
    params.set("user", JSON.stringify({ id: 999, first_name: "Attacker" }));
    expect(() => verifyTelegramInitData(params.toString())).toThrow(/signature/i);
  });

  it("rejects initData older than the 10-minute window", () => {
    const initData = buildInitData({ authDate: Math.floor(Date.now() / 1000) - 601 });
    expect(() => verifyTelegramInitData(initData)).toThrow(/expired/i);
  });

  it("rejects initData with no hash", () => {
    const params = new URLSearchParams(buildInitData());
    params.delete("hash");
    expect(() => verifyTelegramInitData(params.toString())).toThrow(/hash/i);
  });
});
