import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  requestPasswordResetRequestSchema,
  type RequestPasswordResetRequest,
} from "@flowdesk/contracts";
import { requestPasswordReset } from "../api/requestPasswordReset";

/**
 * Always shows the same success message once submitted, whether or not
 * the email actually has an account — the API responds identically
 * either way (see apps/api's auth.service.ts, requestPasswordReset), so
 * showing anything else here would leak exactly what that design is
 * meant to hide.
 */
export function RequestPasswordResetForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetRequest>({
    resolver: zodResolver(requestPasswordResetRequestSchema),
  });

  const mutation = useMutation({ mutationFn: requestPasswordReset });

  if (mutation.isSuccess) {
    return (
      <p className="text-sm">
        If that email has an account, a reset link is on its way.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex max-w-sm flex-col gap-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          {...register("email")}
          className="w-full rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-1"
        />
        {errors.email && <span className="text-[var(--color-text-danger)]">{errors.email.message}</span>}
      </label>

      {mutation.isError && (
        <p className="text-sm text-[var(--color-text-danger)]">{mutation.error.message}</p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-[var(--radius-control)] bg-[var(--color-bg-action-primary)] px-4 py-2 text-[var(--color-text-on-action)] disabled:opacity-50"
      >
        {mutation.isPending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
