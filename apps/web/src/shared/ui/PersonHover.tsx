import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { Avatar } from "./Avatar";
import { buttonVariants } from "./buttonVariants";

const TRIGGER_CLASSES =
  "inline-flex items-center gap-1.5 rounded-sm font-medium text-[var(--color-text-default)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]";

/**
 * A person shown as a link to their profile (a button when they have none) that opens a small card
 * on hover or keyboard focus:
 * avatar, name, and (when known) role and email. Pure CSS (group-hover and
 * group-focus-within), so Tab works too.
 *
 * Timing, so the card does not flash up whenever the cursor merely crosses a name:
 * it opens after a 300 ms pause (a "hover intent" delay) with a 150 ms fade, and
 * closes after 100 ms, which also lets the cursor travel from the name onto the
 * card without it vanishing (the card's wrapper touches the name, no gap).
 * Reduced-motion users get no fade (duration 0), but keep the hover-intent delay: that delay is not motion, and
 * removing it (as `transition-none` did) made the card open the instant the cursor crossed a name.
 *
 * The group is NAMED ("person"): a plain `group` would also react to any ancestor
 * that is a `group` (the comment card is one, for its Edit/Delete reveal), and the
 * card would open when the cursor was anywhere on that ancestor.
 *
 * Domain-free on purpose: it only receives strings. entities/member's PersonName
 * looks the photo, job title, role and email up and renders this. `profileHref` adds a
 * "View profile" link (a router Link, like PageHeader's back link, so this library already
 * depends on the router for that one thing).
 *
 * Position: the card is `position: fixed`, placed under the name from its measured position when the pointer
 * or focus arrives. An absolutely positioned card inside a scrolling list (the issue timeline) was clipped by
 * the list and, even invisible, made it scrollable; a fixed card is neither.
 *
 * Touch screens: the card opens when the button gets focus on tap (not every
 * mobile browser focuses a button on tap, so there it may not open).
 */
export function PersonHover({
  name,
  roleLabel,
  email,
  avatarUrl,
  jobTitle,
  profileHref,
  align = "left",
  children,
}: {
  name: string;
  roleLabel?: string;
  email?: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  /** Where "View profile" goes; no link when omitted. */
  profileHref?: string;
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
  const [place, setPlace] = useState<CSSProperties>({});
  function measure(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    // The card is 16rem wide (or the window minus 2rem). A name near the right edge of the window would push it off
    // screen, so its left edge is held back far enough to keep the whole card in view.
    const cardWidth = Math.min(256, window.innerWidth - 32);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - cardWidth - 8));
    setPlace(align === "right" ? { top: rect.bottom, right: window.innerWidth - rect.right } : { top: rect.bottom, left });
  }
  return (
    <span
      className="group/person relative inline-block"
      onPointerEnter={(event) => measure(event.currentTarget)}
      onFocus={(event) => measure(event.currentTarget)}
    >
      {profileHref ? (
        // The name and the picture are one link to the profile; the card above it only previews.
        <Link to={profileHref} draggable={false} aria-describedby={cardId} className={TRIGGER_CLASSES}>
          {children ?? name}
        </Link>
      ) : (
        // No profile to open (the person left the organization): still focusable, so the card opens.
        <button type="button" aria-describedby={cardId} className={TRIGGER_CLASSES}>
          {children ?? name}
        </button>
      )}
      <span
        id={cardId}
        role="tooltip"
        style={place}
        className={`invisible fixed z-20 w-64 max-w-[calc(100vw-2rem)] pt-1 text-left text-xs font-normal opacity-0 transition-[opacity,visibility] delay-100 duration-150 group-focus-within/person:visible group-focus-within/person:opacity-100 group-focus-within/person:delay-300 group-hover/person:visible group-hover/person:opacity-100 group-hover/person:delay-300 motion-reduce:duration-0`}
      >
        <span className="block rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-[var(--color-text-default)] shadow-lg">
          {/* The picture and the name in the card are a link too (the owner's rule: every picture
              and name of a person leads to their profile). */}
          {(() => {
            const header = (
              <>
                <Avatar name={name} src={avatarUrl} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  {jobTitle && <span className="block truncate text-[var(--color-text-muted)]">{jobTitle}</span>}
                  {roleLabel && <span className="block text-[var(--color-text-muted)]">{roleLabel}</span>}
                </span>
              </>
            );
            return profileHref ? (
              <Link
                to={profileHref}
                className="flex items-center gap-2 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
              >
                {header}
              </Link>
            ) : (
              <span className="flex items-center gap-2">{header}</span>
            );
          })()}
          {email && <span className="mt-2 block truncate text-[var(--color-text-muted)]">{email}</span>}
          {profileHref && (
            <Link to={profileHref} className={`${buttonVariants({ variant: "link" })} mt-2 inline-block`}>
              View profile
            </Link>
          )}
        </span>
      </span>
    </span>
  );
}
