import { RequestPasswordResetForm } from "../../features/request-password-reset";

export function ForgotPasswordPage() {
  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Forgot your password?</h1>
      <RequestPasswordResetForm />
    </main>
  );
}
