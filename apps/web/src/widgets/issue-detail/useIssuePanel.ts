import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";

/**
 * Which issue is open in the side panel, kept in the URL as `?issue=<id>` so Back closes it,
 * a reload keeps it open and the link can be shared. Other query parameters (the issue list
 * filters) are preserved.
 *
 * open() and close() build the new query from the LIVE address bar, not from the render's
 * copy: a page control clicked a moment earlier (a filter, the sort button) may have already
 * changed the URL, and updating from a stale copy would silently undo it.
 *
 * - open(): the first open adds a history entry (so Back closes the panel); opening a
 *   different issue while it is already open replaces the entry, so Back does not walk
 *   through every issue that was looked at.
 * - close(notice?): removes the parameter in place. An optional notice is handed to the page
 *   behind through the router state (NavigationNotice shows it), used when the issue was
 *   deleted.
 */
export function useIssuePanel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const issueId = searchParams.get("issue") || null;

  const open = useCallback(
    (id: string) => {
      const next = new URLSearchParams(window.location.search);
      const alreadyOpen = next.has("issue");
      next.set("issue", id);
      navigate({ search: next.toString() }, { replace: alreadyOpen });
    },
    [navigate],
  );

  const close = useCallback(
    (notice?: string) => {
      const next = new URLSearchParams(window.location.search);
      next.delete("issue");
      navigate({ search: next.toString() }, { replace: true, state: notice ? { notice } : null });
    },
    [navigate],
  );

  return { issueId, open, close };
}
