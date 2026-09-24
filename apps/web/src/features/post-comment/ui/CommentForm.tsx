import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { issueKeys } from "../../../entities/issue";
import { Button, ErrorText, Textarea } from "../../../shared/ui";
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
      <Textarea {...register("body", { required: true })} placeholder="Add a comment…" rows={3} />
      <Button type="submit" size="sm" disabled={mutation.isPending} className="self-start">
        {mutation.isPending ? "Posting…" : "Comment"}
      </Button>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
