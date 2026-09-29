import { useAttachments } from "../api/useAttachments";
import { useDeleteAttachment } from "../api/useDeleteAttachment";
import { Card, EmptyState, Skeleton } from "../../../shared/ui";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * downloadUrl is used directly as a real <a href> — it's already a
 * complete, genuinely time-limited signed link (see the Phase 7 slice
 * 4 plan), not something this component mints or refreshes itself.
 * target="_blank" since Content-Disposition: inline means an image/PDF
 * opens in a new tab rather than navigating away from the issue.
 */
export function AttachmentList({
  organizationId,
  projectId,
  issueId,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const { data: attachments, isPending } = useAttachments(organizationId, projectId, issueId);
  const deleteMutation = useDeleteAttachment(organizationId, projectId, issueId);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (attachments?.length === 0) {
    return <EmptyState>No attachments yet.</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {attachments?.map((attachment) => (
        <Card key={attachment.id} as="li" className="flex items-center justify-between gap-2">
          <a
            href={attachment.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--color-text-link)] underline"
          >
            {attachment.filename}
          </a>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span>
              {formatSize(attachment.sizeBytes)} · {attachment.uploaderName}
            </span>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(attachment.id)}
              disabled={deleteMutation.isPending}
              className="text-[var(--color-text-link)] underline disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </Card>
      ))}
    </ul>
  );
}
