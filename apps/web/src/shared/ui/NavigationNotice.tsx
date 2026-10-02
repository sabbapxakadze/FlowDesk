import { X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { IconButton } from "./IconButton";

/**
 * A one-off message handed over by the page you were just redirected from, e.g.
 * "This project was deleted." The sender navigates with `state: { notice }`;
 * nothing else is stored. It lives in the history entry, so it disappears when
 * you navigate on, and Dismiss clears it without changing the URL. Rendered once,
 * by `Page`, so every logged-in page can show it.
 */
export function NavigationNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: unknown } | null)?.notice;
  if (typeof notice !== "string") return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm"
    >
      <span>{notice}</span>
      <IconButton
        label="Dismiss"
        className="-my-1 -mr-1"
        onClick={() => navigate(location.pathname + location.search, { replace: true, state: null })}
      >
        <X size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
