import type { z } from "zod";
import { getStoredAccessToken } from "../auth/token-store";

/**
 * Mirrors the API's AppError shape (apps/api/src/shared/errors.ts) on the
 * frontend, so a mutation's onError handler can check err.code or read
 * err.details the same way the server built them — one shape, both sides,
 * same idea as everything in packages/contracts.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;
  // Mirrors AppError's data field — free-form, unlike details. First use:
  // a 409's { current: <issue> } payload (see the Phase 3 slice 2 plan).
  readonly data?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, string[]>,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.data = data;
  }
}

/**
 * Thin fetch wrapper, not a data-fetching library — TanStack Query is
 * introduced deliberately in Phase 1 as its own lesson (caching,
 * invalidation, server vs. client state), not smuggled in here as
 * incidental plumbing for a health check.
 *
 * Every call is validated against the same Zod schema the API used to build
 * its response, from @flowdesk/contracts. If the two ever drift, this
 * throws instead of handing the rest of the app a shape it doesn't
 * actually have.
 */
/**
 * Reads whatever's currently in the token store (see shared/auth/token-store.ts)
 * and attaches it as a Bearer header. Harmless to send on the auth
 * endpoints themselves (login/register/refresh) — they don't check it —
 * and required on everything req.ctx-gated (see apps/api's middleware).
 */
function authHeaders(): HeadersInit {
  const token = getStoredAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });

  if (!res.ok) {
    throw await toApiError(res, path, "GET");
  }

  return schema.parse(await res.json());
}

/**
 * Fetches a file the API protects (the access token is a header, not a cookie, so a plain <a href> cannot ask for it)
 * and returns it as a Blob with the file name the server suggested. The caller saves it (see `saveBlob`).
 */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) {
    throw await toApiError(res, path, "GET");
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
  return { blob: await res.blob(), filename };
}

/** Saves a Blob to the person's computer through a temporary link, the standard way to start a download from code. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Multipart upload — no Content-Type header set explicitly, unlike
 * every other helper here. The browser computes the multipart boundary
 * itself and needs to set the header to include it; setting it by hand
 * would omit the boundary and break parsing server-side. First use:
 * attachment uploads (Phase 7 slice 4). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  schema: z.ZodType<T>,
  method: "POST" | "PUT" = "POST",
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    throw await toApiError(res, path, method);
  }

  return schema.parse(await res.json());
}

export async function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await toApiError(res, path, "POST");
  }

  return schema.parse(await res.json());
}

export async function apiPatch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await toApiError(res, path, "PATCH");
  }

  return schema.parse(await res.json());
}

export async function apiDelete<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw await toApiError(res, path, "DELETE");
  }

  return schema.parse(await res.json());
}

/** Same as apiDelete, for a DELETE that returns 204 No Content — first
 * use: attachment deletion (Phase 7 slice 4). An optional JSON body is for the
 * rare delete that must carry a confirmation (deleting a project, ADR 0022). */
export async function apiDeleteVoid(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: body === undefined ? authHeaders() : { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw await toApiError(res, path, "DELETE");
  }
}

/** For endpoints that return 204 No Content — nothing to parse or validate. */
export async function apiPostVoid(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw await toApiError(res, path, "POST");
  }
}

/** Same as apiPostVoid, for PATCH endpoints that return 204 No Content —
 * first use: notifications' mark-read/mark-all-read (Phase 7 slice 3). */
export async function apiPatchVoid(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw await toApiError(res, path, "PATCH");
  }
}

async function toApiError(res: Response, path: string, method: string): Promise<Error> {
  const body: unknown = await res.json().catch(() => null);
  const error =
    body && typeof body === "object" && "error" in body
      ? (
          body as {
            error: {
              code: string;
              message: string;
              details?: Record<string, string[]>;
              data?: Record<string, unknown>;
            };
          }
        ).error
      : null;

  if (error) {
    return new ApiError(error.code, res.status, error.message, error.details, error.data);
  }
  return new Error(`${method} ${path} failed with status ${res.status}`);
}
