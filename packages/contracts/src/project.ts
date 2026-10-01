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

/**
 * Rename only. The key is deliberately NOT editable: it is part of every issue
 * key ("WEB-12") that people have in links, commits and heads (Phase 8.5 slice 3).
 * No version field: a project has no version column, so concurrent renames are
 * last write wins, like editing a comment.
 */
export const updateProjectRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
});

export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export const updateProjectResponseSchema = z.object({
  data: projectSchema,
});

export type UpdateProjectResponse = z.infer<typeof updateProjectResponseSchema>;

/**
 * Deleting a project removes every issue, comment, file, sprint and history under
 * it, so the API asks for the project's exact name in the body as well as the
 * UI asking the person to type it: a stray request or script cannot do this by
 * accident (ADR 0022).
 */
export const deleteProjectRequestSchema = z.object({
  confirmName: z.string(),
});

export type DeleteProjectRequest = z.infer<typeof deleteProjectRequestSchema>;
