import jwt from "jsonwebtoken";
import { env } from "./env.js";
import type { AuthTokenPayload } from "../types/index.js";

/**
 * Access tokens are deliberately short-lived: they cannot be revoked, so their
 * lifetime is the window in which a stolen one stays useful. Long-term
 * sessions are held by revocable refresh tokens instead (see sessionService).
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
