import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issueKeys } from "../../../entities/issue";
import { createComment } from "../api/createComment";

type FormValues = { body: string };

export function CommentForm({
  organizationId,
  projectId,
  issueId,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormValues>({ defaultValues: { body: "" } });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => createComment(organizationId, projectId, issueId, data),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => data.body.trim() && mutation.mutate(data))}
      className="flex flex-col gap-2"
    >
      <textarea
        {...register("body", { required: true })}
        placeholder="Add a comment…"
        rows={3}
        className="rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="self-start rounded-[var(--radius-control)] bg-[var(--color-bg-action-primary)] px-3 py-1 text-sm text-[var(--color-text-on-action)] disabled:opacity-50"
      >
        {mutation.isPending ? "Posting…" : "Comment"}
      </button>
      {mutation.isError && (
        <p className="text-sm text-[var(--color-text-danger)]">{mutation.error.message}</p>
      )}
    </form>
  );
}
