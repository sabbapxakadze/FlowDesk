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

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required"),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Shared by login and refresh — both hand back a fresh access token plus
 * who it belongs to, and nothing else. Not shared with register: signing
 * up deliberately does not log you in (see auth.service.ts), so its
 * response has no token to speak of — a different shape for a genuinely
 * different result, not two schemas that happen to drift apart.
 */
export const authSessionSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    name: z.string(),
  }),
});

export type AuthSession = z.infer<typeof authSessionSchema>;
