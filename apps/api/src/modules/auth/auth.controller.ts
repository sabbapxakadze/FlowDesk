import type { Request, Response } from "express";
import { registerRequestSchema, registerResponseSchema } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";

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
