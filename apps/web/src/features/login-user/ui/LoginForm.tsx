import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { loginRequestSchema, type LoginRequest } from "@flowdesk/contracts";
import { useAuth } from "../../../shared/auth/useAuth";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
import { loginUser } from "../api/loginUser";

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (session) => {
      // Same deliberately-vague message either way — login errors don't
      // say whether it was the email or the password that was wrong (see
      // auth.service.ts), so the form has nothing more specific to show.
      login(session);
      void navigate("/");
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex max-w-sm flex-col gap-4"
    >
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} className="w-full" />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <Input type="password" {...register("password")} className="w-full" />
      </Field>

      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Logging in…" : "Log in"}
      </Button>

      <Link to="/forgot-password" className="text-sm text-[var(--color-text-link)] underline">
        Forgot password?
      </Link>
    </form>
  );
}
