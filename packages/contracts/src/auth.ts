import { z } from "zod";

/**
 * The same schema validates the form client-side (React Hook Form's Zod
 * resolver) and the request body server-side — one set of rules, not two
 * that could drift apart. See ADR 0002.
 */
export const registerRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  organizationName: z.string().min(1, "Organization name is required"),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const registerResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
  }),
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
  }),
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;
