import { useState } from "react";
import { SidePanel, useExitPresence } from "../../shared/ui";
import { IssueDetail } from "./IssueDetail";
import { useIssuePanel } from "./useIssuePanel";

/**
 * The side panel for the issue named by `?issue=` in the URL, or nothing when there is
 * none. A page renders this once and passes `panel.open` to its issue cards.
 * `key={issueId}` gives every issue a fresh state (an edit form left open on one issue must
 * not carry over to the next one).
 *
 * When the issue is closed the panel slides out instead of vanishing: it stays mounted for the
 * exit animation (useExitPresence) and keeps showing the issue it had, while the URL has already
 * lost `?issue=`. Opening another issue while one is open keeps the same panel (no slide again).
 */
export function IssuePanel({ projectId }: { projectId: string }) {
  const { issueId, close } = useIssuePanel();
  const { rendered, closing } = useExitPresence(Boolean(issueId), 220);
  // The last issue that was open, so the panel has something to show while it slides away.
  const [shownId, setShownId] = useState(issueId);
  if (issueId && issueId !== shownId) setShownId(issueId);

  if (!rendered || !shownId) return null;

  return (
    <SidePanel label="Issue" closing={closing} onClose={() => close()}>
      <IssueDetail
        key={shownId}
        variant="panel"
        projectId={projectId}
        issueId={shownId}
        onClose={() => close()}
        onGone={() => close("This issue was deleted.")}
      />
    </SidePanel>
  );
}
