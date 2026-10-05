# 0031 - Account: email, password, timezone

Status: Accepted - 2026-10-05.

## Context

A person could not change their email, change their password while logged in (only the public "forgot password" email
flow existed), or choose a timezone. The owner asked for all three, on a private page apart from the profile.

## Decision

- **A private `/account` page** (reached from Edit profile), separate from the profile everyone sees (ADR 0028): three
  sections, Email, Password, Timezone.
- **Changing the email is two steps.** The person enters the new address AND their current password; a confirmation link
  goes to the NEW address and a notice to the old one; the email changes only when the link is opened. A typo or an
  address that is not theirs can never lock them out or take over an account. The link is single use and expires in 24
  hours; a newer request retires older ones; at confirmation the address is checked again (someone may have registered it
  meanwhile). The new address counts as verified, because its owner just opened a link sent to it. It reuses the
  `auth_tokens` table (new purpose `email_change`, new nullable `new_email` column). The raw token exists only in the
  email, as for the other tokens.
- **Changing the password needs the current password**, and the new one must differ. Afterwards every OTHER session is
  signed out and this one is kept, and a notice is emailed. "This session" is known from the refresh cookie (its token
  family), and that cookie is scoped to `/api/v1/auth`, so the endpoint is `POST /auth/change-password` and not under
  `/users/me`. If no usable cookie arrives there is no "this device": every session ends and the caller is told
  (`keptThisSession: false`) and sent to the login page. The existing forgot-password flow stays, linked from the form.
- **Timezone** is `users.timezone` (an IANA name; null means the browser's), validated with `Intl` on the server and
  carried in the session response so the web app can use it at once. Today it changes one thing: the exact time shown
  when pointing at a relative time ("5 minutes ago"). It is there for later absolute dates (due dates).
- **Both password-checking endpoints share the login rate limit**, so the page is not a way to guess passwords.

## Trade-offs, named

- Asking for a new address that already has an account answers 409 "already exists". That tells a signed-in, rate-limited
  person that an address is registered; "check your email" for an address that will never get one would be worse.
- Email delivery is not tested end to end: the e2e and API tests create the token themselves, as the recovery tests do.
- Changing the email does not sign other sessions out (the password change does).

## Alternatives rejected

- Change the email at once with the password: a typo locks the person out of resets, and nobody confirms the address.
- Keep every session after a password change: if the reason is that someone else has the password, they would stay in.
- Put it all on Edit profile: public fields and a security change on one form.
