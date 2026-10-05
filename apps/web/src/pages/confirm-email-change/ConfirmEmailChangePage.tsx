import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { apiPostVoid } from "../../shared/api/client";
import { buttonVariants } from "../../shared/ui";

type Status = "pending" | "success" | "error";

/**
 * Opened from the link sent to the NEW address. Single use, so the call is guarded against React's development double
 * run (the second, harmless call would otherwise look like a failure right after the first one worked), the same way
 * the verify-email page does it.
 */
export function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "pending" : "error");
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!token || hasFiredRef.current) return;
    hasFiredRef.current = true;
    apiPostVoid("/v1/auth/email-change/confirm", { token })
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <main>
      <h1 className="mb-6 font-display text-3xl font-normal">Confirm your new email</h1>
      {status === "pending" && <p className="text-[var(--color-text-muted)]">Confirming…</p>}
      {status === "success" && (
        <p className="text-sm">
          Your email was changed. Use the new address from now on.{" "}
          <Link to="/login" className={buttonVariants({ variant: "link" })}>
            Log in
          </Link>
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-[var(--color-text-danger)]">
          This confirmation link is invalid, has expired, or the address is already in use.
        </p>
      )}
    </main>
  );
}
