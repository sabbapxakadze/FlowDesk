import { useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Attachment } from "@flowdesk/contracts";
import { ImagePreviewDialog } from "../../../shared/ui";
import { formatFileSize } from "../../../shared/ui/lib/formatFileSize";
import { issueKeys } from "../api/queryKeys";

/**
 * The one way an attachment is linked, used by the attachment list and by the files
 * on a comment. Images open in a preview popup (zoom, Download); everything else
 * keeps the old behaviour: a plain link, opened in a new tab.
 *
 * The image link is still a real <a href>: a middle click, a ctrl/cmd click or
 * "open in new tab" skip the popup and open the image the normal way.
 *
 * The signed download link lives only 5 minutes and is minted when the attachment
 * list is fetched, so a preview opened from a long-stale page can find its link
 * expired. When the image fails to load, the list is refetched (once per opening);
 * the parent re-renders with the fresh link and the popup shows the image.
 */
export function AttachmentLink({
  attachment,
  className,
  children,
}: {
  attachment: Attachment;
  className?: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const retried = useRef(false);
  // Bumped after a refetch so the image is requested again even when the refreshed
  // link happens to be identical (a refetch within the same second mints the same
  // signature). The server ignores query parameters it does not know.
  const [attempt, setAttempt] = useState(0);

  if (!attachment.mimeType.startsWith("image/")) {
    return (
      <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <>
      <a
        href={attachment.downloadUrl}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          retried.current = false;
          setAttempt(0);
          setOpen(true);
        }}
      >
        {children}
      </a>
      {open && (
        <ImagePreviewDialog
          src={attempt === 0 ? attachment.downloadUrl : `${attachment.downloadUrl}&retry=${attempt}`}
          filename={attachment.filename}
          sizeLabel={formatFileSize(attachment.sizeBytes)}
          onClose={() => setOpen(false)}
          onLoadError={() => {
            if (retried.current) return;
            retried.current = true;
            // Wait for the fresh list (and so the fresh link), then ask for the image again.
            void queryClient
              .invalidateQueries({ queryKey: issueKeys.attachments(attachment.issueId) })
              .then(() => setAttempt((n) => n + 1));
          }}
        />
      )}
    </>
  );
}
