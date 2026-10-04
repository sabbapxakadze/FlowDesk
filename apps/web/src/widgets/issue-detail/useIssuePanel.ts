import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";

/**
 * Which issue is open in the side panel, kept in the URL as `?issue=WEB-12` (an old `?issue=<id>` still
 * works) so Back closes it,
 * a reload keeps it open and the link can be shared. Other query parameters (the issue list
 * filters) are preserved.
 *
 * open() and close() build the new address from the LIVE address bar (path and query), not
 * from the render's copy: something clicked a moment earlier (a sidebar link, a filter) may
 * have already changed the URL, and updating from a stale copy would silently undo it.
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
  const issueRef = searchParams.get("issue") || null;

  const open = useCallback(
    (ref: string) => {
      const next = new URLSearchParams(window.location.search);
      const alreadyOpen = next.has("issue");
      next.set("issue", ref);
      navigate({ pathname: window.location.pathname, search: next.toString() }, { replace: alreadyOpen });
    },
    [navigate],
  );

  const close = useCallback(
    (notice?: string) => {
      const next = new URLSearchParams(window.location.search);
      next.delete("issue");
      navigate(
        { pathname: window.location.pathname, search: next.toString() },
        { replace: true, state: notice ? { notice } : null },
      );
    },
    [navigate],
  );

  /** Rewrites `?issue=` in place (an old id or a lowercase key becomes the readable key), without a history entry. */
  const rewrite = useCallback(
    (ref: string) => {
      const next = new URLSearchParams(window.location.search);
      next.set("issue", ref);
      navigate({ pathname: window.location.pathname, search: next.toString() }, { replace: true });
    },
    [navigate],
  );

  return { issueRef, open, close, rewrite };
}
