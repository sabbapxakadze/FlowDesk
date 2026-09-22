import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { apiPostVoid } from "../../shared/api/client";

type Status = "pending" | "success" | "error";

/**
 * A ref guard, not just a plain effect — React 18 StrictMode
 * double-invokes effects in development to surface exactly this kind of
 * bug, and a verification token is single-use: firing the API call twice
 * would make the *second*, harmless call look like a real failure right
 * after the first one succeeded. The ref makes sure only one call ever
 * actually goes out, no matter how many times the effect itself runs.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  // No token is known synchronously, from the URL, at first render — that
  // belongs in the initial state, not a setState call inside the effect
  // (which would cause an avoidable extra render for something already
  // knowable up front).
  const [status, setStatus] = useState<Status>(token ? "pending" : "error");
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!token || hasFiredRef.current) return;
    hasFiredRef.current = true;

    apiPostVoid("/v1/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">Verify your email</h1>
      {status === "pending" && <p className="text-gray-400">Verifying…</p>}
      {status === "success" && (
        <p className="text-sm">
          Your email is verified.{" "}
          <Link to="/login" className="text-blue-600 underline">
            Log in
          </Link>
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">
          This verification link is invalid or has expired.
        </p>
      )}
    </main>
  );
}
