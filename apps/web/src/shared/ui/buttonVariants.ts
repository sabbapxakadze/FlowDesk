import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

// The solid variants use `not-disabled:` (not `enabled:`) for their hover, ring and press effects: `:enabled` only ever matches a real <button>, so a
// link that borrows the look (buttonVariants on a <Link>, like the landing page's "Create account") would have had no hover at all.
const buttonVariantClasses = cva(
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
          "bg-[var(--color-bg-action-success)] text-[var(--color-text-on-action-strong)] not-disabled:hover:bg-[var(--color-bg-action-success-hover)] not-disabled:hover:ring-2 not-disabled:hover:ring-[var(--color-ring-action-hover)] not-disabled:active:brightness-90",
        // Create: a solid teal "add something new" button (New issue), the same in both themes. White text.
        create:
          "bg-[var(--color-bg-action-create)] text-[var(--color-text-on-action-strong)] not-disabled:hover:bg-[var(--color-bg-action-create-hover)] not-disabled:hover:ring-2 not-disabled:hover:ring-[var(--color-ring-action-hover)] not-disabled:active:brightness-90",
        // Delete: a solid red for the first click...
        danger:
          "bg-[var(--color-bg-action-danger)] text-[var(--color-text-on-action-strong)] not-disabled:hover:bg-[var(--color-bg-action-danger-hover)] not-disabled:hover:ring-2 not-disabled:hover:ring-[var(--color-ring-action-hover)] not-disabled:active:brightness-90",
        // ...and a stronger red for the final, irreversible confirm.
        dangerStrong:
          "bg-[var(--color-bg-action-danger-strong)] text-[var(--color-text-on-action-strong)] not-disabled:hover:bg-[var(--color-bg-action-danger-strong-hover)] not-disabled:hover:ring-2 not-disabled:hover:ring-[var(--color-ring-action-hover)] not-disabled:active:brightness-90",
        // Text that acts: an underlined link-coloured word (Edit, Remove, "View as table").
        // No padding (see the compound variant below); for a router <Link> or an <a>,
        // use buttonVariants({ variant: "link" }) so it looks the same.
        link: "text-[var(--color-text-link)] underline",
      },
      size: {
        sm: "px-3 py-1",
        md: "px-4 py-2",
      },
      // Full-width buttons for the centered auth forms.
      fullWidth: { true: "w-full", false: "" },
    },
    // A link has no box of its own, whatever the size.
    compoundVariants: [{ variant: "link", class: "p-0" }],
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  },
);

/**
 * The classes for a button-looking element. Merged with tailwind-merge so a later
 * class wins over an earlier one (the link variant's `p-0` over the size's `px-3`),
 * both for <Button> and for an <a> or <Link> that only borrows the look.
 */
export function buttonVariants(props?: VariantProps<typeof buttonVariantClasses>): string {
  return twMerge(buttonVariantClasses(props));
}
