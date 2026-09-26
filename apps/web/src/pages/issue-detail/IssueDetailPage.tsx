import { useState } from "react";
import { Link, useParams } from "react-router";
import type { IssueEvent } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { useIssue, useIssueEvents } from "../../entities/issue";
import { EditIssueForm } from "../../features/edit-issue";
import { CommentForm } from "../../features/post-comment";
import { useAuth } from "../../shared/auth/useAuth";
import { Card, Skeleton, STATUS_LABELS, StatusBadge } from "../../shared/ui";

function IssueDetailSkeleton() {
  return (
    <main className="p-8">
      <Skeleton className="h-4 w-32" />
      <div className="mt-2 mb-4">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="mb-2 h-7 w-64" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-6 mb-2 h-5 w-20" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

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
    case "issue.moved": {
      const fromStatus = String(event.payload.fromStatus);
      const toStatus = String(event.payload.toStatus);
      return fromStatus === toStatus
        ? "reordered this issue"
        : `moved this issue to ${STATUS_LABELS[toStatus as keyof typeof STATUS_LABELS] ?? toStatus}`;
    }
    default:
      return event.type;
  }
}

function TimelineEntry({ event }: { event: IssueEvent }) {
  if (event.type === "issue.commented") {
    return (
      <Card as="li" className="rounded-[var(--radius-control)] px-3 py-2">
        <p className="text-xs text-[var(--color-text-muted)]">{event.actorName} commented</p>
        <p className="text-sm">{String(event.payload.body)}</p>
      </Card>
    );
  }

  return (
    <li className="text-sm text-[var(--color-text-muted)]">
      {event.actorName} {describeEvent(event)}
    </li>
  );
}

export function IssueDetailPage() {
  const { organization } = useAuth();
  const { projectId, issueId } = useParams<{ projectId: string; issueId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);

  const { data: issue, isPending: issuePending } = useIssue(organization!.id, projectId!, issueId!);

  const { data: events, isPending: eventsPending } = useIssueEvents(
    organization!.id,
    projectId!,
    issueId!,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  if (projectsPending || issuePending) {
    return <IssueDetailSkeleton />;
  }

  if (!project || !issue) {
    return <p className="p-8 text-[var(--color-text-danger)]">Issue not found.</p>;
  }

  return (
    <main className="p-8">
      <Link to={`/projects/${project.id}`} className="text-sm text-[var(--color-text-link)] underline">
        ← {project.name}
      </Link>

      {showConflictNotice && (
        <p className="mt-2 text-sm text-[var(--color-text-warning)]">
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
          <p className="text-sm text-[var(--color-text-muted)]">
            {project.key}-{issue.number}
          </p>
          <h1 className="text-2xl font-semibold">{issue.title}</h1>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={issue.status} />
            <button
              onClick={() => {
                setShowConflictNotice(false);
                setIsEditing(true);
              }}
              className="text-sm text-[var(--color-text-link)] underline"
            >
              Edit
            </button>
          </div>
          {issue.description && <p className="mt-2">{issue.description}</p>}
        </div>
      )}

      <h2 className="mt-6 mb-2 text-lg font-semibold">Activity</h2>
      {eventsPending ? (
        <TimelineSkeleton />
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
