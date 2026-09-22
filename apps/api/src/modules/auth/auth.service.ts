import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "./auth.repository.js";
import { generateRefreshToken, hashToken, signAccessToken } from "./tokens.js";

function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "org";
}

/**
 * Organization slugs aren't something the user is registering "for" —
 * they're derived from the name they typed. A collision doesn't mean
 * anything wrong happened, so it's resolved silently with a random suffix
 * rather than bothered the user with an error. There's a small race window
 * between this check and the actual insert (same tradeoff as the email
 * check below) — acceptable here since a lost race just means a retry, not
 * data corruption, and slug collisions on a random suffix are very rare.
 */
async function generateUniqueSlug(organizationName: string): Promise<string> {
  const base = toSlug(organizationName);
  let candidate = base;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await authRepository.organizationSlugExists(candidate))) {
      return candidate;
    }
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  throw new Error("Could not generate a unique organization slug");
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "23505" &&
    (err as { constraint?: unknown }).constraint === constraint
  );
}

const EMAIL_TAKEN_ERROR = () =>
  new AppError("email_already_registered", 409, "An account with this email already exists.");

export async function register(input: {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}) {
  const email = input.email.toLowerCase().trim();

  // Checked here for a fast, clean error message. The unique index on
  // users.email (see db/schema/users.ts) is the actual guarantee — two
  // near-simultaneous registrations for the same email can't both slip
  // past this check, only the database constraint is race-proof. The
  // catch block below is what handles that case.
  const existing = await authRepository.findUserByEmail(email);
  if (existing) {
    throw EMAIL_TAKEN_ERROR();
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const organizationSlug = await generateUniqueSlug(input.organizationName);

  try {
    return await authRepository.createUserWithOrganization({
      email,
      passwordHash,
      name: input.name,
      organizationName: input.organizationName,
      organizationSlug,
    });
  } catch (err) {
    if (isUniqueViolation(err, "users_email_unique")) {
      throw EMAIL_TAKEN_ERROR();
    }
    throw err;
  }
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const INVALID_CREDENTIALS_ERROR = () =>
  new AppError("invalid_credentials", 401, "Incorrect email or password.");

const INVALID_REFRESH_ERROR = () =>
  new AppError("invalid_refresh_token", 401, "Your session has expired. Please log in again.");

/**
 * One session row per issued refresh token (see db/schema/sessions.ts).
 * Both login and a successful refresh call this to hand back a fresh
 * token pair — the only difference between them is which familyId they
 * use: login starts a new one, refresh continues the caller's existing one.
 */
async function issueSession(userId: string, familyId: string) {
  const refreshToken = generateRefreshToken();
  await authRepository.createSession({
    userId,
    familyId,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

export async function login(input: { email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const user = await authRepository.findUserByEmail(email);

  // Same error for "no such account" and "wrong password" — a different
  // message for each would let an attacker use this endpoint to check
  // which emails have accounts at all (user enumeration).
  if (!user) {
    throw INVALID_CREDENTIALS_ERROR();
  }
  const passwordMatches = await argon2.verify(user.passwordHash, input.password);
  if (!passwordMatches) {
    throw INVALID_CREDENTIALS_ERROR();
  }

  const familyId = randomUUID();
  const { accessToken, refreshToken } = await issueSession(user.id, familyId);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

export async function refresh(refreshToken: string) {
  const session = await authRepository.findSessionByTokenHash(hashToken(refreshToken));

  if (!session) {
    throw INVALID_REFRESH_ERROR();
  }

  if (session.revokedAt) {
    // This exact token was already used (or already explicitly revoked)
    // once before. Seeing it again is a stolen-token signal, not a normal
    // retry — the whole lineage dies, not just this one request. See
    // ADR 0003 and db/schema/sessions.ts.
    await authRepository.revokeFamily(session.familyId);
    throw INVALID_REFRESH_ERROR();
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw INVALID_REFRESH_ERROR();
  }

  // Valid — this token is now spent; a new one takes its place in the
  // same family.
  await authRepository.revokeSession(session.id);

  const { accessToken, refreshToken: newRefreshToken } = await issueSession(
    session.userId,
    session.familyId,
  );

  const user = await authRepository.findUserById(session.userId);
  if (!user) {
    throw INVALID_REFRESH_ERROR();
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/**
 * Logout and logout-all both identify the caller from the refresh cookie
 * itself, not an access token — an access token that's already expired
 * shouldn't make a browser tab unable to log out.
 */
export async function logout(refreshToken: string) {
  const session = await authRepository.findSessionByTokenHash(hashToken(refreshToken));
  if (session) {
    await authRepository.revokeFamily(session.familyId);
  }
  // No error if the token was already invalid — logging out of a session
  // that's already gone is a no-op, not a failure.
}

export async function logoutAll(refreshToken: string) {
  const session = await authRepository.findSessionByTokenHash(hashToken(refreshToken));
  if (session) {
    await authRepository.revokeAllForUser(session.userId);
  }
}
