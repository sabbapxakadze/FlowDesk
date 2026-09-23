import { useState } from "react";
import { Link, useParams } from "react-router";
import type { IssueEvent } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { useIssues, useIssueEvents } from "../../entities/issue";
import { EditIssueForm } from "../../features/edit-issue";
import { CommentForm } from "../../features/post-comment";
import { useAuth } from "../../shared/auth/useAuth";

function describeEvent(event: IssueEvent): string {
  switch (event.type) {
    case "issue.created":
      return "created this issue";
    case "issue.label_added":
      return `added the "${String(event.payload.labelName)}" label`;
    case "issue.label_removed":
      return `removed the "${String(event.payload.labelName)}" label`;
    case "issue.updated": {
      const parts: string[] = [];
      if ("title" in event.payload) parts.push(`changed the title to "${String(event.payload.title)}"`);
      if ("status" in event.payload) parts.push(`changed status to ${String(event.payload.status)}`);
      if ("description" in event.payload) parts.push("updated the description");
      return parts.length > 0 ? parts.join(", ") : "updated this issue";
    }
    default:
      return event.type;
  }
}

function TimelineEntry({ event }: { event: IssueEvent }) {
  if (event.type === "issue.commented") {
    return (
      <li className="rounded border border-gray-200 px-3 py-2">
        <p className="text-xs text-gray-500">{event.actorName} commented</p>
        <p className="text-sm">{String(event.payload.body)}</p>
      </li>
    );
  }

  return (
    <li className="text-sm text-gray-500">
      {event.actorName} {describeEvent(event)}
    </li>
  );
}

/**
 * No dedicated "get one issue" endpoint — reuses the already-fetched
 * useIssues(projectId) list, same reasoning ProjectDetailPage uses for
 * finding its project from the cached org-wide project list.
 */
export function IssueDetailPage() {
  const { organization } = useAuth();
  const { projectId, issueId } = useParams<{ projectId: string; issueId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: issues, isPending: issuesPending } = useIssues(organization!.id, projectId!);
  const issue = issues?.find((i) => i.id === issueId);

  const { data: events, isPending: eventsPending } = useIssueEvents(
    organization!.id,
    projectId!,
    issueId!,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  if (projectsPending || issuesPending) {
    return <p className="p-8 text-gray-400">Loading…</p>;
  }

  if (!project || !issue) {
    return <p className="p-8 text-red-600">Issue not found.</p>;
  }

  return (
    <main className="p-8">
      <Link to={`/projects/${project.id}`} className="text-sm text-blue-600 underline">
        ← {project.name}
      </Link>

      {showConflictNotice && (
        <p className="mt-2 text-sm text-amber-600">
          This issue was updated by someone else — showing the latest version.
        </p>
      )}

      {isEditing ? (
        <EditIssueForm
          issue={issue}
          organizationId={organization!.id}
          projectId={project.id}
          onDone={() => setIsEditing(false)}
          onConflict={() => setShowConflictNotice(true)}
        />
      ) : (
        <div className="mt-2 mb-4">
          <p className="text-sm text-gray-500">
            {project.key}-{issue.number}
          </p>
          <h1 className="text-2xl font-semibold">{issue.title}</h1>
          <p className="text-sm text-gray-400">{issue.status}</p>
          {issue.description && <p className="mt-2">{issue.description}</p>}
          <button
            onClick={() => {
              setShowConflictNotice(false);
              setIsEditing(true);
            }}
            className="mt-2 text-sm text-blue-600 underline"
          >
            Edit
          </button>
        </div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-semibold">Activity</h2>
      {eventsPending ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events?.map((event) => (
            <TimelineEntry key={event.id} event={event} />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <CommentForm organizationId={organization!.id} projectId={project.id} issueId={issue.id} />
      </div>
    </main>
  );
}
