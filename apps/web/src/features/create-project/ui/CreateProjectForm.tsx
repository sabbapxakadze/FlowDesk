import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProjectRequestSchema, type CreateProjectRequest } from "@flowdesk/contracts";
import { projectKeys } from "../../../entities/project";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
import { createProject } from "../api/createProject";

/**
 * Gated server-side by requirePermission("manage_project") — Owner/Admin
 * only (see apps/api/src/modules/projects/projects.routes.ts). This form
 * doesn't hide itself from a Member/Viewer; a 403 from the API is what
 * actually enforces it. Hiding the button too is a nice touch for later,
 * not a substitute for the real check.
 */
export function CreateProjectForm({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProjectRequest>({ resolver: zodResolver(createProjectRequestSchema) });

  const mutation = useMutation({
    mutationFn: (data: CreateProjectRequest) => createProject(organizationId, data),
    onSuccess: () => {
      reset();
      // Same cache the entity's useProjects hook reads — this is the
      // TanStack Query pattern for "a write happened, this read is now
      // stale": invalidate the key, let the next render refetch it.
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="mb-6 flex flex-wrap items-end gap-2"
    >
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} placeholder="Website" />
      </Field>

      <Field label="Key" error={errors.key?.message}>
        <Input {...register("key")} placeholder="WEB" className="w-24 uppercase" />
      </Field>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Adding…" : "Add project"}
      </Button>

      {mutation.isError && <ErrorText className="w-full">{mutation.error.message}</ErrorText>}
    </form>
  );
}
