import { describe, expect, it } from "vitest";
import { signAuthToken, verifyAuthToken } from "./jwt.js";

describe("signAuthToken / verifyAuthToken", () => {
  it("round-trips a payload", () => {
    const token = signAuthToken({ userId: "user-1", telegramId: 42 });
    const payload = verifyAuthToken(token);
    expect(payload.userId).toBe("user-1");
    expect(payload.telegramId).toBe(42);
  });

  it("rejects a tampered token", () => {
    const token = signAuthToken({ userId: "user-1", telegramId: 42 });
    const lastChar = token.at(-1);
    const tampered = token.slice(0, -1) + (lastChar === "a" ? "b" : "a");
    expect(() => verifyAuthToken(tampered)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => verifyAuthToken("not-a-real-token")).toThrow();
  });
});
