import { describe, expect, it } from "vitest";
import { isValidWebhookSecret, shouldProcessUpdate } from "./bot.js";

describe("isValidWebhookSecret", () => {
  it("accepts the exact configured secret", () => {
    expect(isValidWebhookSecret(process.env.TELEGRAM_WEBHOOK_SECRET)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isValidWebhookSecret("wrong-secret")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isValidWebhookSecret(undefined)).toBe(false);
  });
});

describe("shouldProcessUpdate", () => {
  it("allows an update_id once and blocks a redelivery of the same id", () => {
    const updateId = Math.floor(Math.random() * 1_000_000_000);
    expect(shouldProcessUpdate(updateId)).toBe(true);
    expect(shouldProcessUpdate(updateId)).toBe(false);
  });

  it("treats different update_ids independently", () => {
    const a = Math.floor(Math.random() * 1_000_000_000);
    const b = a + 1;
    expect(shouldProcessUpdate(a)).toBe(true);
    expect(shouldProcessUpdate(b)).toBe(true);
  });
});
