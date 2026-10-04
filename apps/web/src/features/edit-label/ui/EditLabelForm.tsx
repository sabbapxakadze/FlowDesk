import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Label } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { labelKeys } from "../../../entities/label";
import { Button, ErrorText, Input } from "../../../shared/ui";
import { updateLabel } from "../api/updateLabel";

type FormValues = { name: string; color: string };

/**
 * Inline edit for one label: a name box and a colour picker. A native
 * <input type="color"> always yields "#rrggbb", which is what the contract
 * accepts. Sends only what changed (the API needs at least one field).
 */
export function EditLabelForm({
  organizationId,
  label,
  onDone,
}: {
  organizationId: string;
  label: Label;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { name: label.name, color: label.color.toLowerCase() },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      updateLabel(organizationId, label.id, {
        ...(data.name !== label.name ? { name: data.name } : {}),
        ...(data.color.toLowerCase() !== label.color.toLowerCase()
          ? { color: data.color }
          : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(organizationId) });
      // Labels already attached to issues are cached per issue under issueKeys.all.
      void queryClient.invalidateQueries({ queryKey: issueKeys.all });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        const nothingChanged =
          data.name === label.name &&
          data.color.toLowerCase() === label.color.toLowerCase();
        if (nothingChanged) return onDone();
        mutation.mutate(data);
      })}
      className="motion-rise-in flex flex-wrap items-center gap-2"
    >
      <input
        type="color"
        aria-label="Label colour"
        {...register("color")}
        className="h-8 w-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-transparent p-0.5"
      />
      <Input
        {...register("name", { required: true })}
        aria-label="Label name"
        className="w-56"
      />
      <Button type="submit" size="sm" pending={mutation.isPending} variant="success">
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
