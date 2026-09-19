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
