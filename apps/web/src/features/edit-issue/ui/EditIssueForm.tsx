import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue, IssueStatus } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { ApiError } from "../../../shared/api/client";
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
      // A successful update just wrote an issue.updated event — the
      // timeline (if anything is showing it) needs to pick that up too.
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issue.id) });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
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
      className="mb-2 flex flex-col gap-2 rounded-lg border border-gray-300 px-4 py-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          {...register("title", { required: true })}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <input {...register("description")} className="rounded border border-gray-300 px-2 py-1" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Status
        <select {...register("status")} className="rounded border border-gray-300 px-2 py-1">
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        Labels
        <LabelPicker organizationId={organizationId} projectId={projectId} issueId={issue.id} />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-gray-300 px-3 py-1 text-sm"
        >
          Cancel
        </button>
      </div>

      {showGenericError && <p className="text-sm text-red-600">{mutation.error?.message}</p>}
    </form>
  );
}
