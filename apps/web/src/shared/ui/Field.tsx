import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * Lifted from RegisterForm's local `Field` component — the same
 * label + input + per-field-error shape was already being retyped by
 * hand in every other form, so this promotes the already-proven pattern
 * to shared/ui instead of inventing a new one.
 */
export function Field({
  label,
  error,
  className,
  reserveErrorSpace = false,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  /**
   * For fields in an inline row (the create forms, where inputs and the button sit side by
   * side): always keep one line for the error, empty until needed, so a validation message
   * appearing never makes this field taller and never shifts its neighbours or the button.
   * The message takes no width of its own (w-0 + min-w-full), so a message longer than a narrow
   * field (the project Key) runs on to the right over empty space instead of widening the field.
   * Off by default: a stacked form
   * (login, register) has no neighbours to shift and should not get a permanent empty gap.
   */
  reserveErrorSpace?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm font-medium", className)}>
      {label}
      {children}
      {reserveErrorSpace ? (
        <span
          title={error}
          className="h-5 w-0 min-w-full text-sm font-normal whitespace-nowrap text-[var(--color-text-danger)]"
        >
          {error}
        </span>
      ) : (
        error && <span className="font-normal text-[var(--color-text-danger)]">{error}</span>
      )}
    </label>
  );
}

/**
 * The submit button of an inline row of `reserveErrorSpace` fields. It carries the same empty
 * trailing line a Field reserves for its error, so with the row's items-end alignment the
 * button's bottom lines up with the inputs' bottoms by construction, not by a magic number.
 */
export function FieldRowAction({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {children}
      <span aria-hidden="true" className="h-5" />
    </div>
  );
}
