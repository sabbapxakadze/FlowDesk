import type { ButtonHTMLAttributes } from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./buttonVariants";
import { cn } from "./lib/cn";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, fullWidth, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, fullWidth }), className)} {...props} />;
}
