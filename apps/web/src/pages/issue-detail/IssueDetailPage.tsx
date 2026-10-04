import { useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { useCurrentProject } from "../../entities/project";
import { IssueByKey } from "../../widgets/issue-detail";
import { projectPath } from "../../shared/lib/paths";

/**
 * The route /projects/:projectKey/issues/:issueKey (ADR 0030), e.g. /projects/WEB/issues/WEB-12. All the content
 * lives in the issue-detail widget (shared with the side panel); this page only supplies the project and the
 * issue reference from the address, rewrites an old or lowercase address to the readable one, and decides
 * where to go when the issue is gone.
 */
export function IssueDetailPage() {
  const project = useCurrentProject();
  const { issueKey: issueRef = "" } = useParams<{ issueKey: string }>();
  const navigate = useNavigate();
  const onCanonical = useCallback(
    (canonical: string) => navigate(`${projectPath(project.key)}/issues/${canonical}`, { replace: true }),
    [navigate, project.key],
  );

  return (
    <IssueByKey
      project={project}
      issueRef={issueRef}
      onCanonical={onCanonical}
      onGone={() => navigate(projectPath(project.key), { replace: true, state: { notice: "This issue was deleted." } })}
    />
  );
}
