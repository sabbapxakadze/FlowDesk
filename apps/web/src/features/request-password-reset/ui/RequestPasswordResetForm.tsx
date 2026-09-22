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
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
        {errors.email && <span className="text-red-600">{errors.email.message}</span>}
      </label>

      {mutation.isError && (
        <p className="text-sm text-red-600">{mutation.error.message}</p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
