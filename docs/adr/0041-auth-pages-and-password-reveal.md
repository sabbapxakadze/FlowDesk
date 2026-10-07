# 0041 - The auth pages' look, and a show / hide password button

Status: Accepted - 2026-10-06.

## Context

The login and register pages were a plain white card on a plain page. The owner asked for a better look with blurred color in the background, sign-in with Google/GitHub, and a
show / hide password button. From five frosted-glass variants (after three first options) they chose **A4**: one card with a Log in / Create account switch over soft blurred shapes.

## Decision

- **A frosted-glass card over three blurred shapes** in `app/AuthLayout.tsx`, shared by every public auth page (login, register, verify email, forgot and reset password, accept invitation, confirm email change).
  The shapes are decoration (`aria-hidden`, no pointer events, clipped by the page so they cannot cause sideways scrolling, smaller on a phone). The card is the `.glass-card` class: a translucent surface with a backdrop blur.
- **Tokens, not raw colors:** `--color-bg-glass`, `--color-border-glass` and `--color-aurora-1..3`, in the light, dark and system blocks of `semantic.css`. Light uses teal, blue and amber; dark uses deeper teal, indigo and pink.
- **A plain-surface fallback**: where the browser cannot blur what is behind an element (`@supports`), or the person asked for less transparency (`prefers-reduced-transparency`), the card is the normal surface color, so the text never depends on what happens to be behind it.
- **The switch** (login and register only): two links, "Log in" and "Create account", in a segmented control at the top of the card; the current one is filled with the create color, `aria-current="page"`. Links, not ARIA tabs, for the reason in ADR 0034 (each is its own address).
  The card stays put and only its content fades and rises in (ADR 0029), so a switch plays the motion on the form, and logging out still lands on a page that arrives.
- **`PasswordInput`** (`shared/ui`): a password field with an eye button inside its right edge. It is hidden every time the field appears; the button is `type="button"` (never submits), named "Show password" / "Hide password" with `aria-pressed` and `aria-controls`, and a mouse press on it does not
  take focus out of the field. It replaces all 8 password inputs in 6 forms (login, register, reset password, accept invitation, change email, change password).
- **The field's accessible name.** `Field`'s `<label>` wraps its control, so a button inside would have become part of the name ("Password Show password"). `Field` now puts the label text in a span with an id and offers it through a small context (`field-label.ts`);
  `PasswordInput` names itself by it with `aria-labelledby`. Other controls are untouched.

## Not in this change: sign-in with Google or GitHub (built afterwards: see ADR 0042)

It is a slice of its own, and the buttons are not shown until it exists (no dead buttons). What it needs: provider apps created by the owner (Google Cloud console, GitHub settings) and their credentials in the environment; a callback endpoint with a CSRF check;
a rule for linking to an existing account (by verified email); a decision about accounts without a password (the users table requires a password hash today) and about change-password and reset for them; a fake provider for the tests. The card has room for the buttons and an "or with email" line.

## Trade-offs, named

- Existing tests that looked a password field up by the loose label "Password" would also have matched the toggle ("Show password"); 13 lines now say `{ exact: true }`.
- The glass depends on the page behind it being the soft shapes; a very different background would need the contrast checked again.
- A revealed password stays revealed until the person hides it or leaves the page; it does not hide itself after a pause.
- Safari and Firefox rendering of the blur was not seen; the fallback is designed for them but not looked at.

## Alternatives rejected

- A split-screen layout, a blurred copy of the product behind the card, bokeh circles, sunset colors, floating product fragments and a mesh gradient with a glowing border (the other mockups): the owner preferred A4.
- A toggle outside the field, or one that shows the password while a key is held: less discoverable, and awkward on a touch screen.
- Renaming the toggle without the word "password" to avoid touching the tests: it would have hurt the screen reader announcement.

## Added 2026-10-06
- The shared `ThemeSwitch` (Light / Dark / System) sits in the top-right corner of every public page, so a theme can be chosen before logging in (remembered in the browser, like in the sidebar).
- The social buttons (ADR 0042) sit side by side with short labels ("Google", "GitHub") and the line "or with email", as in the chosen mockup; their accessible names stay "Continue with Google / GitHub".
- Not added, by the owner's choice: an "open the demo account" button on these pages, and opening the tutorial by default.
- After Create account succeeds, the provider buttons disappear with the form (the page passes them into `RegisterForm` as `above`); they used to stay on top of the confirmation message.
- The "FlowDesk" brand link above the card (to `/`) now leads to the public landing page for visitors (ADR 0043), instead of bouncing back to the login page.
- A "Home" button sits in the top-left corner of every public page (the mirror image of the theme switch) and leads to the landing page (2026-10-07).
- The Home button is transparent (no fill, no border) until pointed at, and going home cross-fades (ADR 0029). Phones get extra top padding so the brand clears the two corner controls (a test checks that Home, the brand and the theme switch do not overlap at 360px).
