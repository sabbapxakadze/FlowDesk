import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { registerRequestSchema, type RegisterRequest } from "@flowdesk/contracts";
import { ApiError } from "../../../shared/api/client";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
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
        Account created for <strong>{mutation.data.organization.name}</strong>. Check your
        email for a verification link, then{" "}
        <Link to="/login" className="text-[var(--color-text-link)] underline">
          log in
        </Link>
        .
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
        <Input {...register("name")} className="w-full" />
      </Field>

      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} className="w-full" />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <Input type="password" {...register("password")} className="w-full" />
      </Field>

      <Field label="Organization name" error={errors.organizationName?.message}>
        <Input {...register("organizationName")} className="w-full" />
      </Field>

      {showGeneralError && <ErrorText>{mutation.error?.message}</ErrorText>}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
