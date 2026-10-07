import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "./auth.repository.js";
import * as oauthRepository from "./oauth.repository.js";
import * as organizationsRepository from "../organizations/organizations.repository.js";
import { generateOpaqueToken, hashToken, signAccessToken } from "./tokens.js";
import {
  sendEmailChangeConfirmationEmail,
  sendEmailChangedNotice,
  sendEmailChangeRequestedNotice,
  sendPasswordChangedNotice,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../../lib/email.js";

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
export async function generateUniqueSlug(organizationName: string): Promise<string> {
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

// code and constraint live on err.cause (drizzle wraps the driver error), not on the
// top-level error; same helper shape as labels.service.ts and invitations.service.ts.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505" &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

const EMAIL_TAKEN_ERROR = () =>
  new AppError("email_already_registered", 409, "An account with this email already exists.");

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Shared by email verification and password reset — both are a single-use,
 * hashed, expiring token tied to a user, stored in the same auth_tokens
 * table with a `purpose`. Returns the raw token; only its hash is stored,
 * same pattern as refresh tokens (see tokens.ts and ADR 0003).
 */
async function issueAuthToken(
  userId: string,
  purpose: authRepository.AuthTokenPurpose,
  ttlMs: number,
  newEmail?: string,
): Promise<string> {
  const token = generateOpaqueToken();
  await authRepository.createAuthToken({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
    newEmail,
  });
  return token;
}

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

  let result;
  try {
    result = await authRepository.createUserWithOrganization({
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

  // Not inside the transaction above on purpose — sending an email is an
  // external call with its own failure modes, and a flaky email provider
  // should never be the reason an account fails to create. lib/email.ts's
  // sendEmail already logs-not-throws for the same reason.
  const verificationToken = await issueAuthToken(
    result.user.id,
    "email_verification",
    EMAIL_VERIFICATION_TTL_MS,
  );
  await sendVerificationEmail(result.user.email, verificationToken);

  return result;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
  const refreshToken = generateOpaqueToken();
  await authRepository.createSession({
    userId,
    familyId,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

/**
 * Every user has at most one organization today (see organizations.repository.ts).
 * A person removed from their organization has none: that is a real, user-facing case
 * (ADR 0024), answered with a clear 403 that tells them what to do, not a 500.
 */
async function getPrimaryOrganization(userId: string) {
  const organization = await organizationsRepository.findPrimaryOrganizationForUser(userId);
  if (!organization) {
    throw new AppError(
      "no_organization",
      403,
      "You are not a member of any organization. Ask an owner to invite you again.",
    );
  }
  // An expired "Try the demo" copy cannot start or renew a session, whether or not the clean-up has removed it yet (ADR 0044).
  if (organization.demoExpiresAt && organization.demoExpiresAt.getTime() <= Date.now()) {
    throw new AppError("demo_expired", 401, "This demo has ended. Start a new one from the home page.");
  }
  // `demoExpiresAt` travels as text (it is JSON in the session); null for a real organization (ADR 0044).
  return { ...organization, demoExpiresAt: organization.demoExpiresAt?.toISOString() ?? null };
}

export async function login(input: { email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const user = await authRepository.findUserByEmail(email);

  // Same error for "no such account" and "wrong password" — a different
  // message for each would let an attacker use this endpoint to check
  // which emails have accounts at all (user enumeration). An account with no
  // password (made with Google/GitHub) answers the same way.
  if (!user || !user.passwordHash) {
    throw INVALID_CREDENTIALS_ERROR();
  }
  const passwordMatches = await argon2.verify(user.passwordHash, input.password);
  if (!passwordMatches) {
    throw INVALID_CREDENTIALS_ERROR();
  }

  return startSessionFor(user);
}

/**
 * A new login session (a new token family) for someone who has just proved who they are, by password or through a
 * provider. Before the session is created: someone with no organization gets no session row.
 */
export async function startSessionFor(user: { id: string; email: string; name: string; timezone: string | null }) {
  const organization = await getPrimaryOrganization(user.id);
  const familyId = randomUUID();
  const { accessToken, refreshToken } = await issueSession(user.id, familyId);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone },
    organization,
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

  const [user, organization] = await Promise.all([
    authRepository.findUserById(session.userId),
    getPrimaryOrganization(session.userId),
  ]);
  if (!user) {
    throw INVALID_REFRESH_ERROR();
  }
  const { accessToken, refreshToken: newRefreshToken } = await issueSession(
    session.userId,
    session.familyId,
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, email: user.email, name: user.name, timezone: user.timezone },
    organization,
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

const INVALID_TOKEN_ERROR = (message: string) => new AppError("invalid_token", 400, message);

export async function verifyEmail(token: string): Promise<void> {
  const authToken = await authRepository.findValidAuthToken(
    hashToken(token),
    "email_verification",
  );
  if (!authToken) {
    throw INVALID_TOKEN_ERROR("This verification link is invalid or has expired.");
  }

  await authRepository.markAuthTokenUsed(authToken.id);
  await authRepository.verifyUserEmail(authToken.userId);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await authRepository.findUserByEmail(normalizedEmail);

  // Always the same outcome whether or not the account exists — same
  // non-enumeration pattern as login (see INVALID_CREDENTIALS_ERROR above).
  // The caller (controller) always responds the same way regardless.
  if (user) {
    const token = await issueAuthToken(user.id, "password_reset", PASSWORD_RESET_TTL_MS);
    await sendPasswordResetEmail(user.email, token);
  }
}

export async function confirmPasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const authToken = await authRepository.findValidAuthToken(
    hashToken(input.token),
    "password_reset",
  );
  if (!authToken) {
    throw INVALID_TOKEN_ERROR("This reset link is invalid or has expired.");
  }

  const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
  await authRepository.markAuthTokenUsed(authToken.id);
  await authRepository.updateUserPassword(authToken.userId, passwordHash);

  // A password reset is treated as "possible compromise" — every existing
  // session dies, not just the device the reset happened on.
  await authRepository.revokeAllForUser(authToken.userId);
}

/** Field-level 400s (the form shows the message under the right field), same shape as other validation errors. */
const FIELD_ERROR = (field: string, message: string) =>
  new AppError("validation_error", 400, message, { [field]: [message] });

/** Is this a real IANA timezone name (what `Intl` accepts)? */
function isRealTimezone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

export async function getAccount(userId: string) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError("unauthenticated", 401, "Your account no longer exists.");
  return {
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    pendingEmail: await authRepository.findPendingEmailChange(userId),
    timezone: user.timezone,
    hasPassword: user.passwordHash !== null,
    connectedAccounts: await oauthRepository.listIdentitiesForUser(userId),
  };
}

export async function updateTimezone(userId: string, timezone: string | null) {
  if (timezone !== null && !isRealTimezone(timezone)) {
    throw FIELD_ERROR("timezone", "That is not a timezone name.");
  }
  await authRepository.updateUserTimezone(userId, timezone);
}

/**
 * Changing the password while logged in. The CURRENT password is required (a stolen session alone must not be enough to
 * take the account), the new one must differ, and afterwards every OTHER session is signed out: the one that made the
 * change is found by the refresh cookie (its token family) and kept. With no usable cookie there is no "this device" to
 * keep, so every session ends and the caller must log in again (`keptThisSession: false`).
 */
export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  refreshToken: string | undefined;
}): Promise<{ keptThisSession: boolean }> {
  const user = await authRepository.findUserById(input.userId);
  if (!user) throw new AppError("unauthenticated", 401, "Your account no longer exists.");
  if (!user.passwordHash) throw NO_PASSWORD_ERROR("currentPassword");
  if (!(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw FIELD_ERROR("currentPassword", "Current password is incorrect.");
  }
  if (await argon2.verify(user.passwordHash, input.newPassword)) {
    throw FIELD_ERROR("newPassword", "Choose a password you are not already using.");
  }

  await authRepository.updateUserPassword(user.id, await argon2.hash(input.newPassword, { type: argon2.argon2id }));
  const keptThisSession = await endOtherSessions(user.id, input.refreshToken);
  await sendPasswordChangedNotice(user.email);
  return { keptThisSession };
}

/** An account made with Google/GitHub has no password until it adds one; the actions that ask for it say so. */
const NO_PASSWORD_ERROR = (field: string) =>
  FIELD_ERROR(field, "This account has no password yet. Add one on the Account page first.");

/**
 * After a password is set or changed: sign out every OTHER session and keep the one that did it (found by its refresh
 * cookie). With no usable cookie there is no "this device" to keep, so every session ends.
 */
async function endOtherSessions(userId: string, refreshToken: string | undefined): Promise<boolean> {
  const session = refreshToken ? await authRepository.findSessionByTokenHash(hashToken(refreshToken)) : undefined;
  const keptThisSession = Boolean(session && session.userId === userId && !session.revokedAt);
  if (keptThisSession && session) {
    await authRepository.revokeOtherFamilies(userId, session.familyId);
  } else {
    await authRepository.revokeAllForUser(userId);
  }
  return keptThisSession;
}

/**
 * The first password of an account made with Google/GitHub (ADR 0042). No "current password" exists to ask for; the
 * person is signed in, which is the proof, and the other sessions are signed out like after any password change.
 */
export async function setPassword(input: {
  userId: string;
  newPassword: string;
  refreshToken: string | undefined;
}): Promise<{ keptThisSession: boolean }> {
  const user = await authRepository.findUserById(input.userId);
  if (!user) throw new AppError("unauthenticated", 401, "Your account no longer exists.");
  if (user.passwordHash) {
    throw new AppError("password_already_set", 409, "This account already has a password. Use 'Change password'.");
  }
  await authRepository.updateUserPassword(user.id, await argon2.hash(input.newPassword, { type: argon2.argon2id }));
  const keptThisSession = await endOtherSessions(user.id, input.refreshToken);
  await sendPasswordChangedNotice(user.email);
  return { keptThisSession };
}

/**
 * Step one of changing the email: the person proves who they are (current password), and a confirmation link goes to
 * the NEW address. Nothing changes until that link is opened, so a typo, or an address that is not theirs, can never
 * lock them out. The OLD address is told about the request. A newer request replaces older pending ones.
 *
 * Telling the requester that an address is already registered is a deliberate trade-off (they are signed in, the
 * route is rate limited, and "check your email" for an address that will never get one would just be confusing).
 */
export async function requestEmailChange(input: { userId: string; newEmail: string; password: string }) {
  const user = await authRepository.findUserById(input.userId);
  if (!user) throw new AppError("unauthenticated", 401, "Your account no longer exists.");
  if (!user.passwordHash) throw NO_PASSWORD_ERROR("password");
  if (!(await argon2.verify(user.passwordHash, input.password))) {
    throw FIELD_ERROR("password", "Password is incorrect.");
  }
  const newEmail = input.newEmail.toLowerCase().trim();
  if (newEmail === user.email) throw FIELD_ERROR("newEmail", "That is already your email.");
  if (await authRepository.findUserByEmail(newEmail)) throw EMAIL_TAKEN_ERROR();

  await authRepository.invalidatePendingEmailChanges(user.id);
  const token = await issueAuthToken(user.id, "email_change", EMAIL_CHANGE_TTL_MS, newEmail);
  await sendEmailChangeConfirmationEmail(newEmail, token);
  await sendEmailChangeRequestedNotice(user.email, newEmail);
  return { pendingEmail: newEmail };
}

/** Step two: the link from the new address. Single use, expires, and re-checks that the address is still free. */
export async function confirmEmailChange(token: string): Promise<void> {
  const authToken = await authRepository.findValidAuthToken(hashToken(token), "email_change");
  if (!authToken || !authToken.newEmail) {
    throw INVALID_TOKEN_ERROR("This confirmation link is invalid or has expired.");
  }
  const user = await authRepository.findUserById(authToken.userId);
  if (!user) throw INVALID_TOKEN_ERROR("This confirmation link is invalid or has expired.");
  const existing = await authRepository.findUserByEmail(authToken.newEmail);
  if (existing && existing.id !== user.id) throw EMAIL_TAKEN_ERROR();

  const oldEmail = user.email;
  try {
    await authRepository.updateUserEmail(user.id, authToken.newEmail);
  } catch (err) {
    if (isUniqueViolation(err, "users_email_unique")) throw EMAIL_TAKEN_ERROR();
    throw err;
  }
  await authRepository.invalidatePendingEmailChanges(user.id);
  await sendEmailChangedNotice(oldEmail, authToken.newEmail);
}
