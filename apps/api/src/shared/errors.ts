/**
 * One error type for everything the API deliberately rejects, so every
 * error response has the same shape: a machine-readable code the frontend
 * can branch on, an HTTP status, and a message safe to show a user.
 *
 * This is a skeleton. The real taxonomy (validation, auth, not-found,
 * conflict, etc.) grows as those cases actually appear, starting Phase 1 —
 * inventing the full set now, before there's a single real route, would just
 * be guessing.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}
