import argon2 from "argon2";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "./auth.repository.js";

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
