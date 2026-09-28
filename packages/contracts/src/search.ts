import { z } from "zod";
import { issueSchema } from "./issue.js";

// q is required and trimmed — an empty/whitespace-only query would hit
// websearch_to_tsquery with nothing to match, so reject it here instead of
// round-tripping to the server. max length is a sanity cap, not a real
// constraint search needs.
export const searchIssuesQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(200, "Search query is too long"),
});

export type SearchIssuesQuery = z.infer<typeof searchIssuesQuerySchema>;

// Same { data: [...] } envelope as every other list response. Reuses
// issueSchema as-is — ts_rank's score never leaves the server, same
// precedent as board_rank (see issues.ts's schema comment).
export const searchIssuesResponseSchema = z.object({
  data: z.array(issueSchema),
});

export type SearchIssuesResponse = z.infer<typeof searchIssuesResponseSchema>;
