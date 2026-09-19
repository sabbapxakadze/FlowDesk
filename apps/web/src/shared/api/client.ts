import type { z } from "zod";

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
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(`/api${path}`);

  if (!res.ok) {
    throw new Error(`GET ${path} failed with status ${res.status}`);
  }

  return schema.parse(await res.json());
}
