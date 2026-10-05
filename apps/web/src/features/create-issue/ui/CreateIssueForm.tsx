import { useImperativeHandle, type Ref } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createIssueRequestSchema, type CreateIssueRequest } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { Button, ErrorText, Field, FieldRowAction, Input } from "../../../shared/ui";
import { createIssue } from "../api/createIssue";

export type CreateIssueFormHandle = { focus: () => void };

/**
 * Gated server-side by requirePermission("manage_issue") — Owner/Admin/
 * Member, not Viewer (see apps/api/src/shared/permissions.ts). Same
 * "the 403 is what actually enforces it" note as create-project's form.
 */
export function CreateIssueForm({
  organizationId,
  projectId,
  ref,
}: {
  organizationId: string;
  projectId: string;
  /** `focus()` puts the cursor in the Title field (the "C" shortcut on the issues page). */
  ref?: Ref<CreateIssueFormHandle>;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<CreateIssueRequest>({ resolver: zodResolver(createIssueRequestSchema) });

  useImperativeHandle(ref, () => ({ focus: () => setFocus("title") }), [setFocus]);

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
        {/* The "C" key badge sits inside the empty, unfocused field and goes away once you focus it or type: it only says the
            shortcut exists. Hidden on a phone (no keyboard) and for assistive tech (the field has aria-keyshortcuts). */}
        <div className="relative">
          <Input {...register("title")} placeholder="Something to do" aria-keyshortcuts="c" className="peer w-full pr-10" />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[var(--radius-control)] border border-[var(--color-border-default)] px-1.5 text-xs text-[var(--color-text-muted)] peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden max-sm:hidden"
          >
            C
          </kbd>
        </div>
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
