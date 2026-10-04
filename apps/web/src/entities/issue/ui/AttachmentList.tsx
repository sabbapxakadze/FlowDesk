import type { ReactNode } from "react";
import { useAttachments } from "../api/useAttachments";
import { useDeleteAttachment } from "../api/useDeleteAttachment";
import { Button, buttonVariants, Card, EmptyState, Skeleton, useAnimatedList } from "../../../shared/ui";
import { formatFileSize } from "../../../shared/ui/lib/formatFileSize";
import { AttachmentLink } from "./AttachmentLink";

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
  renderPerson,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
  /** How to show the uploader (the page passes the hoverable person name; entities
   * cannot import each other). Defaults to the plain name. */
  renderPerson?: (person: { userId: string; name: string }) => ReactNode;
}) {
  const { data: attachments, isPending } = useAttachments(organizationId, projectId, issueId);
  const deleteMutation = useDeleteAttachment(organizationId, projectId, issueId);
  const rows = useAnimatedList(attachments ?? [], (attachment) => attachment.id, { ready: !isPending });

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (attachments && rows.length === 0) {
    return <EmptyState>No attachments yet.</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map(({ key, item: attachment, state, index }) => (
        <Card key={key} as="li" rowState={state} rowIndex={index} className="flex items-center justify-between gap-2">
          <AttachmentLink attachment={attachment} className={buttonVariants({ variant: "link" })}>
            {attachment.filename}
          </AttachmentLink>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span>
              {formatFileSize(attachment.sizeBytes)} ·{" "}
              {renderPerson
                ? renderPerson({ userId: attachment.uploaderId, name: attachment.uploaderName })
                : attachment.uploaderName}
              {attachment.commentId && " · from a comment"}
            </span>
            <Button
              type="button"
              variant="link"
              className="text-xs"
              onClick={() => deleteMutation.mutate(attachment.id)}
              disabled={deleteMutation.isPending}
            >
              Remove
            </Button>
          </div>
        </Card>
      ))}
    </ul>
  );
}
