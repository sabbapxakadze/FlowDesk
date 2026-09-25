import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue, IssueStatus } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { ApiError } from "../../../shared/api/client";
import { Button, ErrorText, Field, Input, Select } from "../../../shared/ui";
import { LabelPicker } from "../../edit-issue-labels";
import { updateIssue } from "../api/updateIssue";

type FormValues = { title: string; description: string; status: IssueStatus };

/**
 * version isn't a form field — it's the version the caller already has
 * (issue.version, read when the list was fetched), attached at submit
 * time. That's the whole point of optimistic concurrency: the client
 * sends back what it read, not something it edits.
 *
 * On a version_conflict (409), this doesn't try to merge — it invalidates
 * the issue list (refetches the real current state), closes, and tells
 * the parent via onConflict so it can surface that to the user. Matches
 * the Phase 3 slice 2 plan's decision to keep conflict handling to
 * "refetch and show the real state," not a merge/retry UX.
 */
export function EditIssueForm({
  issue,
  organizationId,
  projectId,
  onDone,
  onConflict,
}: {
  issue: Issue;
  organizationId: string;
  projectId: string;
  onDone: () => void;
  onConflict: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      title: issue.title,
      description: issue.description ?? "",
      status: issue.status,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      updateIssue(organizationId, projectId, issue.id, {
        version: issue.version,
        title: data.title,
        description: data.description,
        status: data.status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      // The dedicated single-issue query (IssueDetailPage) needs its own
      // invalidation — it's no longer served from the list cache, so
      // invalidating the list alone would leave a stale detail view.
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(issue.id) });
      // A successful update just wrote an issue.updated event — the
      // timeline (if anything is showing it) needs to pick that up too.
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issue.id) });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
        void queryClient.invalidateQueries({ queryKey: issueKeys.detail(issue.id) });
        onConflict();
        onDone();
      }
    },
  });

  const showGenericError =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.code === "version_conflict");

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="mb-2 flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border-input)] px-4 py-3"
    >
      <Field label="Title">
        <Input {...register("title", { required: true })} />
      </Field>

      <Field label="Description">
        <Input {...register("description")} />
      </Field>

      <Field label="Status">
        <Select {...register("status")}>
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </Select>
      </Field>

      <div className="flex flex-col gap-1 text-sm">
        Labels
        <LabelPicker organizationId={organizationId} projectId={projectId} issueId={issue.id} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {showGenericError && <ErrorText>{mutation.error?.message}</ErrorText>}
    </form>
  );
}
