import type { MouseEvent } from "react";
import { Link, useNavigate, type LinkProps } from "react-router";
import { withViewTransition } from "../lib/motion";

/**
 * A router `Link` whose page change cross-fades (the browser's View Transition, see `withViewTransition`) instead of cutting. It is a
 * normal link everywhere else: a modified click (new tab, new window, download) and a link with its own `target` keep the browser's
 * default behaviour, a handler that already prevented the click is respected, and under "reduce motion" or in a browser without View
 * Transitions the page simply changes. Used where one whole page replaces another (the landing page and the auth pages).
 */
export function FadeLink({ to, replace, state, onClick, target, ...props }: LinkProps) {
  const navigate = useNavigate();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified || (target && target !== "_self")) return;
    event.preventDefault();
    withViewTransition(() => void navigate(to, { replace, state }));
  }

  return <Link to={to} replace={replace} state={state} target={target} onClick={handleClick} {...props} />;
}
