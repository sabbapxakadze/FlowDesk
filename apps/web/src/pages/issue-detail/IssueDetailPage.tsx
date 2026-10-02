import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Attachment, IssueEvent } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { PersonName, useMemberNames, useMyRole } from "../../entities/member";
import {
  AttachmentList,
  useAttachments,
  useIssue,
  useIssueEvents,
  useLiveIssueDetailUpdates,
} from "../../entities/issue";
import { DeleteIssueButton } from "../../features/delete-issue";
import { EditIssueForm } from "../../features/edit-issue";
import { CommentCard, CommentForm } from "../../features/post-comment";
import { UploadAttachmentForm } from "../../features/upload-attachment";
import { ActivityLine } from "../../widgets/activity-line";
import { useAuth } from "../../shared/auth/useAuth";
import { Page, PageHeader, PriorityBadge, Skeleton, StatusBadge } from "../../shared/ui";

function IssueDetailSkeleton() {
  return (
    <Page>
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
    </Page>
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

/** "Alice is also viewing" / "Alice and Bob are also viewing" / "Alice,
 * Bob, and Carol are also viewing" — plain English list join, with each name
 * the hoverable person name. Not worth a shared/ui component for the one place
 * this is used. */
function Viewers({
  viewers,
  organizationId,
}: {
  viewers: { userId: string; name: string }[];
  organizationId: string;
}) {
  const people = viewers.map((viewer) => (
    <PersonName key={viewer.userId} organizationId={organizationId} userId={viewer.userId} name={viewer.name} />
  ));
  const last = people.length - 1;
  return (
    <>
      {people.map((person, i) => (
        <span key={viewers[i]!.userId}>
          {i > 0 && (i === last ? (last === 1 ? " and " : ", and ") : ", ")}
          {person}
        </span>
      ))}
      {people.length === 1 ? " is also viewing" : " are also viewing"}
    </>
  );
}

function TimelineEntry({
  event,
  files,
  organizationId,
  projectId,
  issueId,
}: {
  event: IssueEvent;
  files: Attachment[];
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  if (event.type === "issue.commented") {
    return (
      <li>
        <CommentCard
          event={event}
          files={files}
          organizationId={organizationId}
          projectId={projectId}
          issueId={issueId}
        />
      </li>
    );
  }

  return <ActivityLine event={event} organizationId={organizationId} />;
}

export function IssueDetailPage() {
  const { organization, user } = useAuth();
  const { projectId, issueId } = useParams<{ projectId: string; issueId: string }>();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);
  const nameOf = useMemberNames(organization!.id);
  const role = useMyRole(organization!.id);
  const navigate = useNavigate();

  const { data: issue, isPending: issuePending } = useIssue(organization!.id, projectId!, issueId!);

  const { data: events, isPending: eventsPending } = useIssueEvents(
    organization!.id,
    projectId!,
    issueId!,
  );
  const { data: attachments } = useAttachments(organization!.id, projectId!, issueId!);
  const { viewers } = useLiveIssueDetailUpdates(projectId!, issueId!, () =>
    navigate(`/projects/${projectId}`, { replace: true, state: { notice: "This issue was deleted." } }),
  );
  const otherViewers = viewers.filter((viewer) => viewer.userId !== user?.id);

  const [isEditing, setIsEditing] = useState(false);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  if (projectsPending || issuePending) {
    return <IssueDetailSkeleton />;
  }

  if (!project || !issue) {
    return (
      <Page>
        <p className="text-[var(--color-text-danger)]">Issue not found.</p>
      </Page>
    );
  }

  return (
    <Page>
      {isEditing ? (
        <>
          <PageHeader
            back={{ to: `/projects/${project.id}`, label: project.name }}
            eyebrow={`${project.key}-${issue.number}`}
            title="Edit issue"
          />
          {showConflictNotice && (
            <p className="mb-4 text-sm text-[var(--color-text-warning)]">
              This issue was updated by someone else — showing the latest version.
            </p>
          )}
          <EditIssueForm
            issue={issue}
            organizationId={organization!.id}
            projectId={project.id}
            onDone={() => setIsEditing(false)}
            onConflict={() => setShowConflictNotice(true)}
          />
        </>
      ) : (
        <>
          <PageHeader
            back={{ to: `/projects/${project.id}`, label: project.name }}
            eyebrow={`${project.key}-${issue.number}`}
            title={issue.title}
          >
            <div className="flex items-center gap-3">
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              {nameOf(issue.assigneeId) && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <PersonName
                    organizationId={organization!.id}
                    userId={issue.assigneeId!}
                    name={nameOf(issue.assigneeId)!}
                    withAvatar
                  />
                </span>
              )}
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
            {otherViewers.length > 0 && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                <Viewers viewers={otherViewers} organizationId={organization!.id} />
              </p>
            )}
          </PageHeader>
          {showConflictNotice && (
            <p className="mb-4 text-sm text-[var(--color-text-warning)]">
              This issue was updated by someone else — showing the latest version.
            </p>
          )}
          {issue.description && <p className="mb-4">{issue.description}</p>}
        </>
      )}

      <h2 className="mt-6 mb-2 text-lg font-semibold">Attachments</h2>
      <AttachmentList
        organizationId={organization!.id}
        projectId={project.id}
        issueId={issue.id}
        renderPerson={(person) => (
          <PersonName organizationId={organization!.id} userId={person.userId} name={person.name} />
        )}
      />
      <div className="mt-2">
        <UploadAttachmentForm organizationId={organization!.id} projectId={project.id} issueId={issue.id} />
      </div>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Activity</h2>
      {eventsPending ? (
        <TimelineSkeleton />
      ) : (
        <ul className="flex flex-col gap-3">
          {events?.map((event) => (
            <TimelineEntry
              key={event.id}
              event={event}
              files={(attachments ?? []).filter((a) => a.commentId === event.payload.commentId)}
              organizationId={organization!.id}
              projectId={project.id}
              issueId={issue.id}
            />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <CommentForm organizationId={organization!.id} projectId={project.id} issueId={issue.id} />
      </div>

      {/* The reporter, or an owner or admin (the API enforces the same rule). */}
      {(issue.reporterId === user?.id || role === "owner" || role === "admin") && (
        <section className="mt-10 border-t border-[var(--color-border-default)] pt-4">
          <h2 className="mb-2 text-sm font-semibold">Danger zone</h2>
          <DeleteIssueButton
            organizationId={organization!.id}
            projectId={project.id}
            issueId={issue.id}
            onDeleted={() =>
              navigate(`/projects/${project.id}`, { replace: true, state: { notice: "This issue was deleted." } })
            }
          />
        </section>
      )}
    </Page>
  );
}
