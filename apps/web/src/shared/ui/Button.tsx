import type { ButtonHTMLAttributes } from "react";
import { Check, Loader2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./buttonVariants";
import { cn } from "./lib/cn";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * A request is running: a spinner before the label, the button is disabled and marked busy. The caller
   * keeps writing the label ("Saving…"); this adds the progress cue (owner's motion pass, 2026-10-04).
   */
  pending?: boolean;
  /** The request just succeeded: a tick before the label (see useSuccessFlash). */
  done?: boolean;
}

/**
 * Every button sinks slightly while it is pressed (`motion-press`), so a click feels registered; disabled
 * buttons do not. The press effect, the spinner and the tick are all off under "reduce motion"
 * (the spinner keeps turning: it is progress, not decoration).
 */
export function Button({ className, variant, size, fullWidth, pending = false, done = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        buttonVariants({ variant, size, fullWidth }),
        "motion-press",
        (pending || done) && "inline-flex items-center justify-center gap-1.5",
        className,
      )}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {done && !pending && <Check size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}
