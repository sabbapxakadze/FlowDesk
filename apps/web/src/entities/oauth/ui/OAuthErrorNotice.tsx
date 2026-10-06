import { X } from "lucide-react";
import { useSearchParams } from "react-router";
import { IconButton } from "../../../shared/ui";
import { oauthErrorMessage } from "../lib/provider-labels";

/**
 * Why a Google/GitHub attempt failed, read from the `?oauth_error=` the server sent the browser back with (ADR 0042).
 * Dismiss removes the parameter, so a reload does not show it again.
 */
export function OAuthErrorNotice() {
  const [params, setParams] = useSearchParams();
  const code = params.get("oauth_error");
  if (!code) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-text-danger)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-danger)]"
    >
      <span>{oauthErrorMessage(code)}</span>
      <IconButton
        label="Dismiss"
        className="-my-1 -mr-1"
        onClick={() =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("oauth_error");
              return next;
            },
            { replace: true },
          )
        }
      >
        <X size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
