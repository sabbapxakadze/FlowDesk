import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "rounded-[var(--radius-control)] text-sm transition-[opacity,background-color,box-shadow] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]",
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
        // Save / confirm: a solid green "go" button.
        success:
          "bg-[var(--color-bg-action-success)] text-[var(--color-text-on-action-strong)] enabled:hover:bg-[var(--color-bg-action-success-hover)] enabled:hover:ring-2 enabled:hover:ring-[var(--color-ring-action-hover)] enabled:active:brightness-90",
        // Delete: a solid red for the first click...
        danger:
          "bg-[var(--color-bg-action-danger)] text-[var(--color-text-on-action-strong)] enabled:hover:bg-[var(--color-bg-action-danger-hover)] enabled:hover:ring-2 enabled:hover:ring-[var(--color-ring-action-hover)] enabled:active:brightness-90",
        // ...and a stronger red for the final, irreversible confirm.
        dangerStrong:
          "bg-[var(--color-bg-action-danger-strong)] text-[var(--color-text-on-action-strong)] enabled:hover:bg-[var(--color-bg-action-danger-strong-hover)] enabled:hover:ring-2 enabled:hover:ring-[var(--color-ring-action-hover)] enabled:active:brightness-90",
      },
      size: {
        sm: "px-3 py-1",
        md: "px-4 py-2",
      },
      // Full-width buttons for the centered auth forms.
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  },
);
