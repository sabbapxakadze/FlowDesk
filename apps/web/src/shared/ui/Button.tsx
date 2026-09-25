import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/cn";

const buttonVariants = cva(
  "rounded-[var(--radius-control)] text-sm transition-[opacity,background-color] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
  {
    variants: {
      variant: {
        // opacity, not a second background token — works identically
        // whichever theme flips bg-action-primary to (near-black in
        // light mode, near-white in dark), no extra token needed.
        primary:
          "bg-[var(--color-bg-action-primary)] text-[var(--color-text-on-action)] hover:opacity-90",
        // Reuses border-default as the hover fill — a subtle neutral
        // surface tint, not a new token just for this one state.
        secondary: "border border-[var(--color-border-input)] hover:bg-[var(--color-border-default)]",
      },
      size: {
        sm: "px-3 py-1",
        md: "px-4 py-2",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
