import { Link } from "react-router";
import { OAuthErrorNotice } from "../../entities/oauth";
import { OAuthButtons } from "../../features/oauth-sign-in";
import { RegisterForm } from "../../features/register-user";
import { buttonVariants } from "../../shared/ui";

export function RegisterPage() {
  return (
    <main>
      <OAuthErrorNotice />
      <h1 className="font-display text-3xl font-normal">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-text-muted)]">Set up your account and your first organization.</p>
      <OAuthButtons />
      <RegisterForm />
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link to="/login" className={buttonVariants({ variant: "link" })}>
          Log in
        </Link>
      </p>
    </main>
  );
}
