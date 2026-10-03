import { useId, type ReactNode } from "react";
import { Avatar } from "./Avatar";

/**
 * A person shown as a button that opens a small card on hover or keyboard focus:
 * avatar, name, and (when known) role and email. Pure CSS (group-hover and
 * group-focus-within), so Tab works too.
 *
 * Timing, so the card does not flash up whenever the cursor merely crosses a name:
 * it opens after a 300 ms pause (a "hover intent" delay) with a 150 ms fade, and
 * closes after 100 ms, which also lets the cursor travel from the name onto the
 * card without it vanishing (the card's wrapper touches the name, no gap).
 * Reduced-motion users get no fade.
 *
 * The group is NAMED ("person"): a plain `group` would also react to any ancestor
 * that is a `group` (the comment card is one, for its Edit/Delete reveal), and the
 * card would open when the cursor was anywhere on that ancestor.
 *
 * Domain-free on purpose: it only receives strings. entities/member's PersonName
 * looks the role and email up and renders this. There is no profile page yet; a
 * "View profile" link goes on this card when one exists.
 *
 * Touch screens: the card opens when the button gets focus on tap (not every
 * mobile browser focuses a button on tap, so there it may not open).
 */
export function PersonHover({
  name,
  roleLabel,
  email,
  align = "left",
  children,
}: {
  name: string;
  roleLabel?: string;
  email?: string;
  /**
   * Which edge of the name the card lines up with. A name at the right end of a row (the
   * uploader in the attachment list) uses "right" so the card opens leftwards: even while
   * invisible, a card sticking out past a scrolling container adds a horizontal scrollbar.
   */
  align?: "left" | "right";
  /** What the button shows; defaults to the name. */
  children?: ReactNode;
}) {
  const cardId = useId();
  return (
    <span className="group/person relative inline-block">
      <button
        type="button"
        aria-describedby={cardId}
        className="inline-flex items-center gap-1.5 rounded-sm font-medium text-[var(--color-text-default)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        {children ?? name}
      </button>
      <span
        id={cardId}
        role="tooltip"
        className={`invisible absolute ${align === "right" ? "right-0" : "left-0"} top-full z-20 w-64 max-w-[calc(100vw-2rem)] pt-1 text-left text-xs font-normal opacity-0 transition-[opacity,visibility] delay-100 duration-150 group-focus-within/person:visible group-focus-within/person:opacity-100 group-focus-within/person:delay-300 group-hover/person:visible group-hover/person:opacity-100 group-hover/person:delay-300 motion-reduce:transition-none`}
      >
        <span className="block rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-[var(--color-text-default)] shadow-lg">
          <span className="flex items-center gap-2">
            <Avatar name={name} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              {roleLabel && <span className="block text-[var(--color-text-muted)]">{roleLabel}</span>}
            </span>
          </span>
          {email && <span className="mt-2 block truncate text-[var(--color-text-muted)]">{email}</span>}
        </span>
      </span>
    </span>
  );
}
