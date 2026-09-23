/**
 * One error type for everything the API deliberately rejects, so every
 * error response has the same shape: a machine-readable code the frontend
 * can branch on, an HTTP status, and a message safe to show a user.
 *
 * The taxonomy grows as real cases appear, not upfront — `details` was
 * added in Phase 2 for the first time a request body can be wrong in more
 * than one field at once (a form needs to know *which* field, not just
 * that something failed).
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;
  // Free-form, unlike details (which is always field -> messages). Added
  // for the first case that needed it: a 409 handing back "the current
  // server state" per CLAUDE.md's concurrency convention. Reusable by any
  // future error that needs to carry structured data, not just a message.
  readonly data?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, string[]>,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.data = data;
  }
}
