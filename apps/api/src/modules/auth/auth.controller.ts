import type { Request, Response } from "express";
import {
  authSessionSchema,
  loginRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
} from "@flowdesk/contracts";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";

const REFRESH_COOKIE_NAME = "flowdesk_refresh_token";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * httpOnly so client-side JS can never read it (the whole point — an XSS
 * bug can't steal it). Scoped to the auth path only, so it's never sent on
 * ordinary API calls, just the endpoints that actually need it. secure is
 * relaxed in development because plain http://localhost can't set a
 * Secure cookie at all. See ADR 0003.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV !== "development",
    path: "/api/v1/auth",
  };
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function readRefreshCookie(req: Request): string {
  const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) {
    throw new AppError("invalid_refresh_token", 401, "No active session.");
  }
  return token;
}

export async function register(req: Request, res: Response) {
  const parsed = registerRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid registration details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { user, organization } = await authService.register(parsed.data);

  const body = registerResponseSchema.parse({
    user: { id: user.id, email: user.email, name: user.name },
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
  });

  res.status(201).json(body);
}

export async function login(req: Request, res: Response) {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid login details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { accessToken, refreshToken, user } = await authService.login(parsed.data);
  setRefreshCookie(res, refreshToken);

  const body = authSessionSchema.parse({ accessToken, user });
  res.status(200).json(body);
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = readRefreshCookie(req);

  try {
    const result = await authService.refresh(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    const body = authSessionSchema.parse({ accessToken: result.accessToken, user: result.user });
    res.status(200).json(body);
  } catch (err) {
    // Any failure here (expired, reused, revoked) means the cookie the
    // browser is holding is no good anymore — clear it so the client
    // doesn't keep retrying with a token that will never work again.
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const refreshToken = readRefreshCookie(req);
  await authService.logout(refreshToken);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response) {
  const refreshToken = readRefreshCookie(req);
  await authService.logoutAll(refreshToken);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(204).end();
}
