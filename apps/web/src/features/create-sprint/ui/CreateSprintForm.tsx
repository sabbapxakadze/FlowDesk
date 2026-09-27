import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSprintRequestSchema, type CreateSprintRequest } from "@flowdesk/contracts";
import { sprintKeys } from "../../../entities/sprint";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
import { createSprint } from "../api/createSprint";

/**
 * Gated server-side by requirePermission("manage_issue") — sprints reuse
 * the issue permissions, no dedicated sprint permission exists (see the
 * Phase 5 slice 4 plan's "Decisions").
 *
 * startDate/endDate are the first date inputs in this codebase: plain
 * native <input type="date">, registered with setValueAs so an empty
 * field becomes undefined (matching the contract's .optional()) instead
 * of an empty string, which z.iso.date() would reject as an invalid date.
 */
export function CreateSprintForm({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSprintRequest>({ resolver: zodResolver(createSprintRequestSchema) });

  const mutation = useMutation({
    mutationFn: (data: CreateSprintRequest) => createSprint(organizationId, projectId, data),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="mb-6 flex flex-wrap items-end gap-2"
    >
      <Field label="Sprint name" error={errors.name?.message} className="flex-1">
        <Input {...register("name")} placeholder="Sprint 1" />
      </Field>

      <Field label="Start date" error={errors.startDate?.message}>
        <Input type="date" {...register("startDate", { setValueAs: (v: string) => (v === "" ? undefined : v) })} />
      </Field>

      <Field label="End date" error={errors.endDate?.message}>
        <Input type="date" {...register("endDate", { setValueAs: (v: string) => (v === "" ? undefined : v) })} />
      </Field>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : "Create sprint"}
      </Button>

      {mutation.isError && <ErrorText className="w-full">{mutation.error.message}</ErrorText>}
    </form>
  );
}
