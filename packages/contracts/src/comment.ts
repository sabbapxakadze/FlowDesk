import { z } from "zod";

export const commentSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  authorId: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Comment = z.infer<typeof commentSchema>;

export const createCommentRequestSchema = z.object({
  body: z.string().min(1, "Comment can't be empty").max(10000, "Comment is too long"),
});

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const createCommentResponseSchema = z.object({
  data: commentSchema,
});

export type CreateCommentResponse = z.infer<typeof createCommentResponseSchema>;
