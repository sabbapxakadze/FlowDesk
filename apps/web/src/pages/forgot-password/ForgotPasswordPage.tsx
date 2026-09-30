import { RequestPasswordResetForm } from "../../features/request-password-reset";

export function ForgotPasswordPage() {
  return (
    <main className="p-8">
      <h1 className="mb-4 font-display text-3xl font-normal">Forgot your password?</h1>
      <RequestPasswordResetForm />
    </main>
  );
}
