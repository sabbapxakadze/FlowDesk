import { Link } from "react-router";
import { RequestPasswordResetForm } from "../../features/request-password-reset";

export function ForgotPasswordPage() {
  return (
    <main>
      <h1 className="mb-6 font-display text-3xl font-normal">Forgot your password?</h1>
      <RequestPasswordResetForm />
      <p className="mt-6 text-sm">
        <Link to="/login" className="text-[var(--color-text-link)] underline">
          Back to log in
        </Link>
      </p>
    </main>
  );
}
