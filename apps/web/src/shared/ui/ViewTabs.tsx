import type { LucideIcon } from "lucide-react";
import { Link, NavLink } from "react-router";
import { cn } from "./lib/cn";

/**
 * Underline tabs that switch between two views of the same thing (the project's Issues list and Board). Each tab is a link to
 * its own address, so this is a `nav` with `aria-current="page"` on the current one, not ARIA `role="tab"` (that is for
 * switching panels on one page). Domain-free: the caller supplies the addresses, labels and icons. The underline sits on the
 * bottom border of the header it is placed in (`-mb-px` overlaps it), like the design-system page shows. `current` is set only when
 * the URL cannot say which tab is current (the design-system page shows both states side by side), as `SideLink` does.
 */
const BASE =
  "flex items-center gap-1.5 border-b-2 pb-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]";
const ON =
  "border-[var(--color-bg-action-primary)] font-medium text-[var(--color-text-default)]";
const OFF =
  "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]";

export function ViewTabs({
  label,
  items,
}: {
  label: string;
  items: {
    to: string;
    label: string;
    Icon: LucideIcon;
    end?: boolean;
    current?: boolean;
  }[];
}) {
  return (
    <nav aria-label={label} className="-mb-px flex gap-4">
      {items.map(({ to, label: text, Icon, end, current }) => {
        const content = (
          <>
            <Icon size={14} aria-hidden="true" />
            {text}
          </>
        );
        return current !== undefined ? (
          <Link
            key={text}
            to={to}
            aria-current={current ? "page" : undefined}
            className={cn(BASE, current ? ON : OFF)}
          >
            {content}
          </Link>
        ) : (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(BASE, isActive ? ON : OFF)}
          >
            {content}
          </NavLink>
        );
      })}
    </nav>
  );
}
