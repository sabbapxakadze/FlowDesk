import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProjectRequestSchema, type CreateProjectRequest } from "@flowdesk/contracts";
import { projectKeys } from "../../../entities/project";
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
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          {...register("name")}
          placeholder="Website"
          className="rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1"
        />
        {errors.name && <span className="text-[var(--color-text-danger)]">{errors.name.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Key
        <input
          {...register("key")}
          placeholder="WEB"
          className="w-24 rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1 uppercase"
        />
        {errors.key && <span className="text-[var(--color-text-danger)]">{errors.key.message}</span>}
      </label>

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-[var(--radius-control)] bg-[var(--color-bg-action-primary)] px-4 py-2 text-sm text-[var(--color-text-on-action)] disabled:opacity-50"
      >
        {mutation.isPending ? "Adding…" : "Add project"}
      </button>

      {mutation.isError && (
        <p className="w-full text-sm text-[var(--color-text-danger)]">{mutation.error.message}</p>
      )}
    </form>
  );
}
