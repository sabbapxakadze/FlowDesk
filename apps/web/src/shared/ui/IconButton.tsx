import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/cn";

const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] disabled:opacity-50 focus-visible:outline-2",
  {
    variants: {
      // neutral: a quiet icon that darkens on hover. danger: the same, turning red
      // (Delete). sidebar: for the dark navigation bar, which has its own colours.
      tone: {
        neutral:
          "text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)] hover:text-[var(--color-text-default)] focus-visible:outline-[var(--color-border-focus)]",
        danger:
          "text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)] hover:text-[var(--color-text-danger)] focus-visible:outline-[var(--color-border-focus)]",
        sidebar:
          "text-[var(--color-text-sidebar-active)] hover:bg-[var(--color-bg-sidebar-active)] focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]",
      },
      // sm: icons of about 14px (comment actions, close X). lg: a 36px square (menu buttons).
      size: { sm: "p-1.5", lg: "h-9 w-9" },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">,
    VariantProps<typeof iconButtonVariants> {
  /** Required: an icon alone has no accessible name. */
  label: string;
  /** The icon, usually a Lucide icon with aria-hidden. */
  children: ReactNode;
}

/**
 * A button that is only an icon. One component so every icon button gets the same
 * hit area, hover and focus ring, and so none can be built without an accessible
 * label (`label` is required and becomes aria-label).
 */
export function IconButton({ label, tone, size, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(iconButtonVariants({ tone, size }), className)}
      {...props}
    />
  );
}
