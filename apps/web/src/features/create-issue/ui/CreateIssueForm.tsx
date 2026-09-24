import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createIssueRequestSchema, type CreateIssueRequest } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
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
      <Field label="Title" error={errors.title?.message} className="flex-1">
        <Input {...register("title")} placeholder="Something to do" />
      </Field>

      <Field label="Description" error={errors.description?.message} className="flex-1">
        <Input {...register("description")} placeholder="Optional" />
      </Field>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Adding…" : "Add issue"}
      </Button>

      {mutation.isError && <ErrorText className="w-full">{mutation.error.message}</ErrorText>}
    </form>
  );
}
