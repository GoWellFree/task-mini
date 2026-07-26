import crypto from "node:crypto";
import { ERROR_CODES, type AuthTokens } from "@task-mini/shared";
import { supabase } from "../lib/supabase.js";
import { ApiError } from "../lib/apiError.js";
import { ACCESS_TOKEN_TTL_SECONDS, signAuthToken } from "../lib/jwt.js";

const REFRESH_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Refresh tokens are opaque random strings, never JWTs: they carry no claims,
 * so they cannot be replayed for anything if the signing secret leaks, and
 * revocation is a database fact rather than a signature question.
 *
 * Only the SHA-256 hash is stored. A database leak therefore does not hand an
 * attacker usable tokens. SHA-256 (not bcrypt) is appropriate here because the
 * input is 256 bits of CSPRNG output, not a guessable human password.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

function expiryFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

interface SessionRow {
  id: string;
  user_id: string;
  revoked_at: string | null;
  replaced_by: string | null;
  expires_at: string;
}

/** Issues an access token plus a fresh refresh token, recording the session. */
export async function createSession(params: {
  userId: string;
  telegramId: number;
  userAgent?: string;
}): Promise<AuthTokens> {
  const refreshToken = generateRefreshToken();

  const { error } = await supabase.from("user_sessions").insert({
    user_id: params.userId,
    token_hash: hashToken(refreshToken),
    expires_at: expiryFromNow(REFRESH_TOKEN_TTL_DAYS),
    user_agent: params.userAgent?.slice(0, 500) ?? null,
  });

  if (error) throw error;

  return {
    accessToken: signAuthToken({ userId: params.userId, telegramId: params.telegramId }),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Exchanges a refresh token for a new pair, rotating the old one.
 *
 * If a token that was already rotated is presented again, it either leaked or
 * was replayed — we cannot tell which, so the entire chain for that user is
 * revoked and they must log in again. This is the standard reuse-detection
 * response and is deliberately more aggressive than failing the one request.
 */
export async function rotateSession(params: {
  refreshToken: string;
  userAgent?: string;
}): Promise<AuthTokens & { userId: string }> {
  const tokenHash = hashToken(params.refreshToken);

  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, user_id, revoked_at, replaced_by, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;

  const session = data as SessionRow | null;
  if (!session) {
    throw new ApiError(ERROR_CODES.SESSION_INVALID);
  }

  if (session.revoked_at) {
    // Already-rotated or explicitly revoked token presented again.
    await revokeAllSessions(session.user_id);
    throw new ApiError(ERROR_CODES.SESSION_REUSED);
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new ApiError(ERROR_CODES.SESSION_EXPIRED);
  }

  const { data: user } = await supabase
    .from("users")
    .select("id, telegram_id")
    .eq("id", session.user_id)
    .maybeSingle();

  const typedUser = user as { id: string; telegram_id: number } | null;
  if (!typedUser) {
    throw new ApiError(ERROR_CODES.SESSION_INVALID);
  }

  const newRefreshToken = generateRefreshToken();
  const { data: inserted, error: insertError } = await supabase
    .from("user_sessions")
    .insert({
      user_id: session.user_id,
      token_hash: hashToken(newRefreshToken),
      expires_at: expiryFromNow(REFRESH_TOKEN_TTL_DAYS),
      user_agent: params.userAgent?.slice(0, 500) ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) throw insertError ?? new ApiError(ERROR_CODES.INTERNAL);

  // Retire the presented token only once its replacement exists, so a failure
  // here can never leave the user with no valid refresh token at all.
  // `is("revoked_at", null)` makes this a compare-and-set: if two refreshes
  // race, only one wins and the loser is treated as reuse on its next attempt.
  const { data: rotated, error: revokeError } = await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString(), replaced_by: inserted.id })
    .eq("id", session.id)
    .is("revoked_at", null)
    .select("id");

  if (revokeError) throw revokeError;

  if (!rotated || rotated.length === 0) {
    // Another concurrent refresh already rotated this session; drop the
    // token we just minted rather than leaving an orphan valid session.
    await supabase.from("user_sessions").delete().eq("id", inserted.id);
    await revokeAllSessions(session.user_id);
    throw new ApiError(ERROR_CODES.SESSION_REUSED);
  }

  return {
    userId: typedUser.id,
    accessToken: signAuthToken({ userId: typedUser.id, telegramId: typedUser.telegram_id }),
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Revokes a single refresh token (logout on this device). Idempotent. */
export async function revokeSession(refreshToken: string): Promise<void> {
  const { error } = await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashToken(refreshToken))
    .is("revoked_at", null);

  if (error) throw error;
}

/** Revokes every active session for a user (logout everywhere). */
export async function revokeAllSessions(userId: string): Promise<void> {
  const { error } = await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error) throw error;
}

/** Active sessions, newest first — backs a "where you're logged in" screen. */
export async function listActiveSessions(userId: string) {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, user_id, revoked_at, expires_at, created_at, last_used_at, user_agent")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
