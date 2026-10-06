import { Link } from "react-router";
import { LoginForm } from "../../features/login-user";
import { buttonVariants, NavigationNotice } from "../../shared/ui";

export function LoginPage() {
  return (
    <main>
      <NavigationNotice />
      <h1 className="mb-6 font-display text-3xl font-normal">Log in</h1>
      <LoginForm />
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        New to FlowDesk?{" "}
        <Link to="/register" className={buttonVariants({ variant: "link" })}>
          Create an account
        </Link>
      </p>
    </main>
  );
}
