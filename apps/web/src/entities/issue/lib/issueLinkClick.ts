import type { MouseEvent } from "react";

/**
 * The click handler for an issue card's link when the page can show the issue in a side
 * panel. A plain left click opens the panel instead of navigating; a modified click (Ctrl,
 * Cmd, Shift, Alt) or a middle click keeps the normal link behaviour, so "open in a new tab"
 * still opens the full page. Does nothing when the page passed no `onOpen` (search results
 * and the like keep plain links), and does nothing for a click a drag guard already
 * cancelled (`defaultPrevented`), so finishing a drag never opens the panel.
 */
export function openIssueOnClick(
  event: MouseEvent,
  onOpen: ((issueId: string) => void) | undefined,
  issueId: string,
) {
  if (!onOpen || event.defaultPrevented) return;
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  onOpen(issueId);
}
