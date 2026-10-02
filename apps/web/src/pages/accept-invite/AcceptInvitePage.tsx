import { Link, useSearchParams } from "react-router";
import { AcceptInvitationForm } from "../../features/accept-invitation";
import { buttonVariants } from "../../shared/ui";

/** Public page at /invite?token=... (inside the AuthLayout card, like verify-email). */
export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  return (
    <main>
      <h1 className="mb-6 font-display text-3xl font-normal">Join your team</h1>
      {token ? (
        <AcceptInvitationForm token={token} />
      ) : (
        <p className="text-sm text-[var(--color-text-danger)]">This invitation link is incomplete.</p>
      )}
      <p className="mt-6 text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link to="/login" className={buttonVariants({ variant: "link" })}>
          Log in
        </Link>
      </p>
    </main>
  );
}
