import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  confirmPasswordResetRequestSchema,
  type ConfirmPasswordResetRequest,
} from "@flowdesk/contracts";
import { resetPassword } from "../api/resetPassword";

/**
 * No auto-login on success — confirmPasswordReset revokes every existing
 * session on the API side (see apps/api's auth.service.ts), so there's no
 * session left to resume even if this page tried. Straight to /login with
 * the new password.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmPasswordResetRequest>({
    resolver: zodResolver(confirmPasswordResetRequestSchema),
    defaultValues: { token },
  });

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => void navigate("/login"),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex max-w-sm flex-col gap-4"
    >
      <input type="hidden" {...register("token")} />

      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password"
          {...register("newPassword")}
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
        {errors.newPassword && (
          <span className="text-red-600">{errors.newPassword.message}</span>
        )}
      </label>

      {mutation.isError && (
        <p className="text-sm text-red-600">{mutation.error.message}</p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
