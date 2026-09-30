import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type Theme } from "../theme";
import { cn } from "./lib/cn";

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * A three-way Light / Dark / System control. `sidebar` is styled from the
 * shell tokens (it sits on the dark sidebar); `default` from the page tokens
 * (it sits on the design-system page). Each button has a text label for
 * assistive technology and `aria-pressed` for the current choice.
 */
export function ThemeSwitch({ variant = "default" }: { variant?: "default" | "sidebar" }) {
  const [theme, setTheme] = useTheme();
  const sidebar = variant === "sidebar";

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex rounded-[var(--radius-control)] border p-0.5",
        sidebar ? "border-[var(--color-border-sidebar)]" : "border-[var(--color-border-input)]",
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 w-8 items-center justify-center rounded-[var(--radius-control)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1",
              sidebar
                ? "focus-visible:outline-[var(--color-text-sidebar-active)]"
                : "focus-visible:outline-[var(--color-border-focus)]",
              sidebar
                ? active
                  ? "bg-[var(--color-bg-sidebar-active)] text-[var(--color-text-sidebar-active)]"
                  : "text-[var(--color-text-sidebar)] hover:text-[var(--color-text-sidebar-active)]"
                : active
                  ? "bg-[var(--color-bg-action-primary)] text-[var(--color-text-on-action)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]",
            )}
          >
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
