import { z } from "zod";

export const projectSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  key: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Project = z.infer<typeof projectSchema>;

/**
 * List responses are enveloped ({ data: [...] }) rather than a bare array
 * so pagination metadata (Phase 4) can be added to the envelope later
 * without changing the response shape client code already depends on.
 */
export const listProjectsResponseSchema = z.object({
  data: z.array(projectSchema),
});

export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;

/**
 * organizationId isn't part of the body — it's the :organizationId in the
 * URL, cross-checked against real membership by requireOrgMembership
 * before this ever reaches the service. key is normalized (uppercased) by
 * the service, not this schema — the contract's job is shape, not casing.
 */
export const createProjectRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  key: z
    .string()
    .min(2, "Key must be 2-10 characters")
    .max(10, "Key must be 2-10 characters")
    .regex(/^[A-Za-z0-9]+$/, "Key must be letters and numbers only"),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

// Same envelope convention as the list — { data: ... }, not the bare
// object, so this stays additive-compatible with the list shape.
export const createProjectResponseSchema = z.object({
  data: projectSchema,
});

export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;
