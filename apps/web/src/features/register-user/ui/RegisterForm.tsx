import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { registerRequestSchema, type RegisterRequest } from "@flowdesk/contracts";
import { ApiError } from "../../../shared/api/client";
import { registerUser } from "../api/registerUser";

/**
 * Validated twice, on purpose: the zodResolver checks the form with the
 * exact same schema (registerRequestSchema) the API enforces server-side —
 * one set of rules, so the two can't quietly disagree about what a valid
 * password looks like. The server check is what actually matters (nothing
 * stops someone from calling the API directly); the client check is just
 * for a fast, no-round-trip "that password's too short" before submitting.
 */
export function RegisterForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterRequest>({ resolver: zodResolver(registerRequestSchema) });

  const mutation = useMutation({
    mutationFn: registerUser,
    onError: (err) => {
      // Field-level errors (e.g. from a validation_error the client-side
      // check somehow missed) get attached to the matching input. Anything
      // else (like "email already registered") is shown once, below the form.
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          setError(field as keyof RegisterRequest, { message: messages[0] });
        }
      }
    },
  });

  if (mutation.isSuccess) {
    return (
      <p className="text-sm">
        Account created for <strong>{mutation.data.organization.name}</strong>. Login isn't
        built yet — that's Phase 2's next slice.
      </p>
    );
  }

  const showGeneralError =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.details);

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex max-w-sm flex-col gap-4"
    >
      <Field label="Name" error={errors.name?.message}>
        <input {...register("name")} className="w-full rounded border border-gray-300 px-2 py-1" />
      </Field>

      <Field label="Email" error={errors.email?.message}>
        <input
          type="email"
          {...register("email")}
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <input
          type="password"
          {...register("password")}
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
      </Field>

      <Field label="Organization name" error={errors.organizationName?.message}>
        <input
          {...register("organizationName")}
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
      </Field>

      {showGeneralError && (
        <p className="text-sm text-red-600">{mutation.error?.message}</p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
