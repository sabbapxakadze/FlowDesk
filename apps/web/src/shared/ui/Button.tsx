import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/cn";

const buttonVariants = cva(
  "rounded-[var(--radius-control)] text-sm disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[var(--color-bg-action-primary)] text-[var(--color-text-on-action)]",
        secondary: "border border-[var(--color-border-input)]",
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
