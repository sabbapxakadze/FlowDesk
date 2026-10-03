import { SidePanel } from "../../shared/ui";
import { IssueDetail } from "./IssueDetail";
import { useIssuePanel } from "./useIssuePanel";

/**
 * The side panel for the issue named by `?issue=` in the URL, or nothing when there is
 * none. A page renders this once and passes `panel.open` to its issue cards.
 * `key={issueId}` gives every issue a fresh state (an edit form left open on one issue must
 * not carry over to the next one).
 */
export function IssuePanel({ projectId }: { projectId: string }) {
  const { issueId, close } = useIssuePanel();
  if (!issueId) return null;

  return (
    <SidePanel label="Issue" onClose={() => close()}>
      <IssueDetail
        key={issueId}
        variant="panel"
        projectId={projectId}
        issueId={issueId}
        onClose={() => close()}
        onGone={() => close("This issue was deleted.")}
      />
    </SidePanel>
  );
}
