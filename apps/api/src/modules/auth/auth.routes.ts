import { Router, type Router as RouterType } from "express";
import {
  loginRateLimiter,
  passwordResetRequestRateLimiter,
  registerRateLimiter,
} from "../../middleware/rate-limit.js";
import * as authController from "./auth.controller.js";

export const authRouter: RouterType = Router();

authRouter.post("/auth/register", registerRateLimiter, authController.register);
authRouter.post("/auth/login", loginRateLimiter, authController.login);
authRouter.post("/auth/refresh", authController.refresh);
authRouter.post("/auth/logout", authController.logout);
authRouter.post("/auth/logout-all", authController.logoutAll);

authRouter.post("/auth/verify-email", authController.verifyEmail);
authRouter.post(
  "/auth/password-reset/request",
  passwordResetRequestRateLimiter,
  authController.requestPasswordReset,
);
authRouter.post("/auth/password-reset/confirm", authController.confirmPasswordReset);
