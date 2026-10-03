import { useNavigate, useParams } from "react-router";
import { IssueDetail } from "../../widgets/issue-detail";

/**
 * The route /projects/:projectId/issues/:issueId. All the content lives in the
 * issue-detail widget (shared with the side panel); this page only supplies the ids from
 * the URL and decides where to go when the issue is gone.
 */
export function IssueDetailPage() {
  const { projectId, issueId } = useParams<{ projectId: string; issueId: string }>();
  const navigate = useNavigate();

  return (
    <IssueDetail
      projectId={projectId!}
      issueId={issueId!}
      onGone={() =>
        navigate(`/projects/${projectId}`, { replace: true, state: { notice: "This issue was deleted." } })
      }
    />
  );
}
