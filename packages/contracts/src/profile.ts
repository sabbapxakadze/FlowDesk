import { z } from "zod";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB in, before the server shrinks it
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const BIO_MAX_LENGTH = 300;
export const JOB_TITLE_MAX_LENGTH = 100;

// An optional text field from a form: "" and whitespace mean "clear it".
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullable()
    .transform((value) => (value === null || value === "" ? null : value));

/** Editing your own profile. All three are always sent, so a form submit is one whole state. */
export const updateProfileRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  jobTitle: optionalText(JOB_TITLE_MAX_LENGTH, "Job title"),
  bio: optionalText(BIO_MAX_LENGTH, "About you"),
});

export type UpdateProfileRequest = z.input<typeof updateProfileRequestSchema>;

/**
 * One person as another member of the same organization sees them (ADR 0028). `avatarUrl` is a
 * stable capability URL (no expiry; the random key in it is the access), or null for initials.
 */
export const profileSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  jobTitle: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Their role in the viewer's organization. */
  role: z.enum(["owner", "admin", "member", "viewer"]),
  /** When they joined this organization. */
  joinedAt: z.iso.datetime(),
});

export type Profile = z.infer<typeof profileSchema>;

export const profileResponseSchema = z.object({ data: profileSchema });

/** The photo endpoints answer with just the new URL (null after a removal). */
export const avatarResponseSchema = z.object({ avatarUrl: z.string().nullable() });

export const profileActivityQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * One line of someone's recent activity: an event on an issue that still exists. The issue's key
 * and title are read live (not snapshots), so the line can link to it.
 */
export const profileActivityItemSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  issueId: z.uuid(),
  issueKey: z.string(),
  issueTitle: z.string(),
  projectId: z.uuid(),
});

export type ProfileActivityItem = z.infer<typeof profileActivityItemSchema>;

export const profileActivityResponseSchema = z.object({
  data: z.array(profileActivityItemSchema),
  nextCursor: z.string().nullable(),
});

export type ProfileActivityResponse = z.infer<typeof profileActivityResponseSchema>;
