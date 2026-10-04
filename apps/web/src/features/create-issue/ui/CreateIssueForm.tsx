import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createIssueRequestSchema, type CreateIssueRequest } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { Button, ErrorText, Field, FieldRowAction, Input } from "../../../shared/ui";
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
      className="mb-6 flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-4 shadow-sm"
    >
      <Field reserveErrorSpace label="Title" error={errors.title?.message} className="flex-1">
        <Input {...register("title")} placeholder="Something to do" />
      </Field>

      <Field reserveErrorSpace label="Description" error={errors.description?.message} className="flex-1">
        <Input {...register("description")} placeholder="Optional" />
      </Field>

      <FieldRowAction>
        <Button type="submit" pending={mutation.isPending}>
          {mutation.isPending ? "Adding…" : "Add issue"}
        </Button>
      </FieldRowAction>

      {mutation.isError && <ErrorText className="w-full">{mutation.error.message}</ErrorText>}
    </form>
  );
}
