import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Attachment, IssueEvent } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { Button, Card, ErrorText, Textarea, Time } from "../../../shared/ui";
import { deleteComment } from "../api/deleteComment";
import { updateComment } from "../api/updateComment";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One comment on the timeline. The server decides `canEdit`/`canDelete` for
 * this viewer (see listIssueEvents), so there is no role logic here: a button
 * shows exactly when the server would accept the request.
 *
 * Delete is a two-step inline confirm, not window.confirm: it stays inside the
 * page, is keyboard reachable, and can be driven like any other UI.
 */
export function CommentCard({
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
  const queryClient = useQueryClient();
  // The API folds these into issue.commented events (see listIssueEvents).
  const payload = event.payload as {
    commentId: string;
    body: string;
    edited: boolean;
    deleted: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(payload.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    void queryClient.invalidateQueries({ queryKey: issueKeys.attachments(issueId) });
  }

  const editMutation = useMutation({
    mutationFn: () => updateComment(organizationId, projectId, issueId, payload.commentId, { body: draft }),
    onSuccess: () => {
      setIsEditing(false);
      refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment(organizationId, projectId, issueId, payload.commentId),
    onSuccess: refresh,
  });

  if (payload.deleted) {
    return (
      <Card className="rounded-[var(--radius-control)] px-3 py-2">
        <p className="text-sm text-[var(--color-text-muted)] italic">
          Comment deleted · <Time iso={event.createdAt} />
        </p>
      </Card>
    );
  }

  return (
    <Card className="rounded-[var(--radius-control)] px-3 py-2">
      <p className="text-xs text-[var(--color-text-muted)]">
        {event.actorName} commented · <Time iso={event.createdAt} />
        {payload.edited && " (edited)"}
      </p>

      {isEditing ? (
        <div className="mt-1 flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="Edit comment"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={editMutation.isPending || !draft.trim() || draft === payload.body}
              onClick={() => editMutation.mutate()}
            >
              {editMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={editMutation.isPending}
              onClick={() => {
                setIsEditing(false);
                setDraft(payload.body);
              }}
            >
              Cancel
            </Button>
          </div>
          {editMutation.isError && <ErrorText>{editMutation.error.message}</ErrorText>}
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{payload.body}</p>
      )}

      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((file) => (
            <li key={file.id} className="text-xs text-[var(--color-text-muted)]">
              <a
                href={file.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-text-link)] underline"
              >
                {file.filename}
              </a>{" "}
              · {formatSize(file.sizeBytes)}
            </li>
          ))}
        </ul>
      )}

      {!isEditing && (payload.canEdit || payload.canDelete) && (
        <div className="mt-1 flex items-center gap-3 text-xs">
          {confirmingDelete ? (
            <>
              <span className="text-[var(--color-text-muted)]">Delete?</span>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                className="text-[var(--color-text-danger)] underline disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting…" : "Yes"}
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => setConfirmingDelete(false)}
                className="text-[var(--color-text-link)] underline"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {payload.canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(payload.body);
                    setIsEditing(true);
                  }}
                  className="text-[var(--color-text-link)] underline"
                >
                  Edit
                </button>
              )}
              {payload.canDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="text-[var(--color-text-link)] underline"
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      )}
      {deleteMutation.isError && <ErrorText>{deleteMutation.error.message}</ErrorText>}
    </Card>
  );
}
