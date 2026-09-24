import { useSearchParams } from "react-router";
import { ResetPasswordForm } from "../../features/reset-password";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Reset your password</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-[var(--color-text-danger)]">This reset link is missing its token.</p>
      )}
    </main>
  );
}
