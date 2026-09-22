import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { loginRequestSchema, type LoginRequest } from "@flowdesk/contracts";
import { useAuth } from "../../../shared/auth/useAuth";
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
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          {...register("email")}
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
        {errors.email && <span className="text-red-600">{errors.email.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          {...register("password")}
          className="w-full rounded border border-gray-300 px-2 py-1"
        />
        {errors.password && <span className="text-red-600">{errors.password.message}</span>}
      </label>

      {mutation.isError && (
        <p className="text-sm text-red-600">{mutation.error.message}</p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {mutation.isPending ? "Logging in…" : "Log in"}
      </button>

      <Link to="/forgot-password" className="text-sm text-blue-600 underline">
        Forgot password?
      </Link>
    </form>
  );
}
