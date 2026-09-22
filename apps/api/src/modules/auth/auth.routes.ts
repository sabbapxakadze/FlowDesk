import { Router, type Router as RouterType } from "express";
import * as authController from "./auth.controller.js";

export const authRouter: RouterType = Router();

authRouter.post("/auth/register", authController.register);
