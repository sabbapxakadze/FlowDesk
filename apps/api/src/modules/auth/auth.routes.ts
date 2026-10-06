import { Router, type Router as RouterType } from "express";
import {
  loginRateLimiter,
  oauthRateLimiter,
  passwordResetRequestRateLimiter,
  registerRateLimiter,
} from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import * as authController from "./auth.controller.js";
import * as oauthController from "./oauth.controller.js";

export const authRouter: RouterType = Router();

authRouter.post("/auth/register", registerRateLimiter, authController.register);
authRouter.post("/auth/login", loginRateLimiter, authController.login);
authRouter.post("/auth/refresh", authController.refresh);
authRouter.post("/auth/logout", authController.logout);
authRouter.post("/auth/logout-all", authController.logoutAll);

// Sign in with Google / GitHub (ADR 0042). `start` is a POST (so "connect" can send the access token) that answers with the
// provider's URL; `callback` is the GET the provider redirects the browser to. Disconnect needs a signed-in person.
authRouter.get("/auth/oauth/providers", oauthController.listProviders);
authRouter.post("/auth/oauth/:provider/start", oauthRateLimiter, oauthController.start);
authRouter.get("/auth/oauth/:provider/callback", oauthRateLimiter, oauthController.callback);
authRouter.delete("/users/me/oauth/:provider", requireAuth, oauthController.disconnect);

authRouter.post("/auth/verify-email", authController.verifyEmail);
authRouter.post(
  "/auth/password-reset/request",
  passwordResetRequestRateLimiter,
  authController.requestPasswordReset,
);
authRouter.post("/auth/password-reset/confirm", authController.confirmPasswordReset);

// The account page (private to the signed-in person). Changing the password and asking for a new email re-check the
// current password, so they share the login rate limit; change-password lives under /auth so the refresh cookie (which is
// scoped to /api/v1/auth) reaches it and the server knows which session to keep.
authRouter.get("/users/me/account", requireAuth, authController.getAccount);
authRouter.patch("/users/me/timezone", requireAuth, authController.updateTimezone);
authRouter.post("/auth/change-password", requireAuth, loginRateLimiter, authController.changePassword);
authRouter.post("/auth/set-password", requireAuth, loginRateLimiter, authController.setPassword);
authRouter.post("/auth/email-change/request", requireAuth, loginRateLimiter, authController.requestEmailChange);
authRouter.post("/auth/email-change/confirm", authController.confirmEmailChange);
