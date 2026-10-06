import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useFieldLabelId } from "./field-label";
import { IconButton } from "./IconButton";
import { Input } from "./Input";
import { cn } from "./lib/cn";

/**
 * A password field with a show / hide button inside its right edge (ADR 0041). Like `Input` it is `forwardRef` plus spread props, so
 * React Hook Form's `{...register("password")}` works unchanged.
 *
 * - The password is hidden every time the field appears; the button reveals it for as long as the person wants.
 * - The button is `type="button"` (it never submits the form), named "Show password" / "Hide password" with `aria-pressed`, and a mouse
 *   press on it does not take focus out of the field, so the caret stays where it was.
 * - Inside a `Field`, the input names itself by the label's text (see field-label.ts), not by the button.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordInput(
  { className, id, "aria-labelledby": labelledBy, ...props },
  ref,
) {
  const [shown, setShown] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const fieldLabelId = useFieldLabelId();

  return (
    <div className="relative">
      <Input
        ref={ref}
        id={inputId}
        type={shown ? "text" : "password"}
        aria-labelledby={labelledBy ?? fieldLabelId}
        className={cn("w-full pr-10", className)}
        {...props}
      />
      <IconButton
        label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={inputId}
        // A press on the button must not move focus out of the field.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setShown((value) => !value)}
        className="absolute top-1/2 right-1 -translate-y-1/2"
      >
        {shown ? (
          <EyeOff size={16} aria-hidden="true" />
        ) : (
          <Eye size={16} aria-hidden="true" />
        )}
      </IconButton>
    </div>
  );
});
