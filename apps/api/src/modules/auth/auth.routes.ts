import { Router, type Router as RouterType } from "express";
import * as authController from "./auth.controller.js";

export const authRouter: RouterType = Router();

authRouter.post("/auth/register", authController.register);
authRouter.post("/auth/login", authController.login);
authRouter.post("/auth/refresh", authController.refresh);
authRouter.post("/auth/logout", authController.logout);
authRouter.post("/auth/logout-all", authController.logoutAll);
