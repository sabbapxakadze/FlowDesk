import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createIssueRequestSchema, type CreateIssueRequest } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { createIssue } from "../api/createIssue";

/**
 * Gated server-side by requirePermission("manage_issue") — Owner/Admin/
 * Member, not Viewer (see apps/api/src/shared/permissions.ts). Same
 * "the 403 is what actually enforces it" note as create-project's form.
 */
export function CreateIssueForm({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateIssueRequest>({ resolver: zodResolver(createIssueRequestSchema) });

  const mutation = useMutation({
    mutationFn: (data: CreateIssueRequest) => createIssue(organizationId, projectId, data),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="mb-6 flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Title
        <input
          {...register("title")}
          placeholder="Something to do"
          className="rounded border border-gray-300 px-2 py-1"
        />
        {errors.title && <span className="text-red-600">{errors.title.message}</span>}
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm">
        Description
        <input
          {...register("description")}
          placeholder="Optional"
          className="rounded border border-gray-300 px-2 py-1"
        />
        {errors.description && <span className="text-red-600">{errors.description.message}</span>}
      </label>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Adding…" : "Add issue"}
      </button>

      {mutation.isError && (
        <p className="w-full text-sm text-red-600">{mutation.error.message}</p>
      )}
    </form>
  );
}
