import { Link } from "react-router";
import { RegisterForm } from "../../features/register-user";

export function RegisterPage() {
  return (
    <main>
      <h1 className="mb-6 font-display text-3xl font-normal">Create your account</h1>
      <RegisterForm />
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link to="/login" className="text-[var(--color-text-link)] underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
