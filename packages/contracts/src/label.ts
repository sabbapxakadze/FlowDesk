import { z } from "zod";

export const labelSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Label = z.infer<typeof labelSchema>;

// Same envelope convention as project.ts's list response.
export const listLabelsResponseSchema = z.object({
  data: z.array(labelSchema),
});

export type ListLabelsResponse = z.infer<typeof listLabelsResponseSchema>;

export const createLabelRequestSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name is too long"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex code, e.g. #FF5733"),
});

export type CreateLabelRequest = z.infer<typeof createLabelRequestSchema>;

export const createLabelResponseSchema = z.object({
  data: labelSchema,
});

export type CreateLabelResponse = z.infer<typeof createLabelResponseSchema>;

// Attaching a label responds with the issue's full current label set
// (same shape as listLabelsResponseSchema) rather than just the one
// attached — one shape for "here are this issue's labels now," whether
// it's a plain read or the result of a write.
export const attachLabelRequestSchema = z.object({
  labelId: z.uuid(),
});

export type AttachLabelRequest = z.infer<typeof attachLabelRequestSchema>;
