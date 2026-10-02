# 0024 — Inviting people to an organization

Status: Accepted — 2026-10-03. Slice A (invite, accept, members list) is built.
Slice B (change a role, remove a member, re-send an invitation) is next and will
amend this ADR.

## Context

FlowDesk had roles (owner, admin, member, viewer) and a members list used by the
assignee picker, but no way to add anyone: registering always creates your own
organization with you as owner, and the second people in tests were inserted straight
into the database. A collaboration tool needs a way to bring collaborators in.

Facts that shaped the design (read in the code, not assumed):

- The database allows many organizations per user (a composite key on
  `organization_members`), but the app assumes one: login returns the first
  membership (`findPrimaryOrganizationForUser`), and the web app has no organization
  switcher.
- Signing up does not log you in; email verification and password reset already use a
  hashed, expiring, single-use token pattern (`auth_tokens`).
- An email wrapper (Resend) exists. A send failure is logged, never thrown.
- Resend refuses some dev addresses, so an invitation email may not arrive.

## Decision

- **Only people without an account can be invited (Option A, chosen with the owner).**
  The link opens a short sign-up form whose account joins the inviter's organization
  instead of creating a personal one. An email that already has an account is refused
  with a plain message (`email_has_account`; `already_member` if they are in this
  organization). Allowing existing accounts needs an organization switcher and a changed
  login flow, so it is a later slice. The data model already supports it.
- **`invitations` table** (organization, lower-cased email, role, token hash, who
  invited, expiry 7 days, accepted_at, revoked_at). The raw token exists only in the
  emailed link and in the create response; only its sha256 hash is stored, like sessions
  and auth tokens. Rows are kept after use or revoke (the history stays readable).
  A **partial unique index** allows one open invitation per organization and email, so
  that rule is the database's, not only the service's; an expired open invitation is
  revoked when the same address is invited again.
- **Permission `manage_members`** for owner and admin. They can invite admin, member or
  viewer. `owner` cannot be invited (ownership transfer is its own feature).
- **API:** `GET/POST /organizations/:id/invitations` and
  `DELETE .../invitations/:invitationId` (owner/admin, org-scoped); public
  `POST /invitations/preview` and `POST /invitations/accept`, the token in the body, not
  the URL, so it stays out of logs, rate-limited like registering.
- **Accepting** claims the invitation with `UPDATE ... WHERE accepted_at IS NULL AND
  revoked_at IS NULL`, creates the user (email already verified, because the invitation
  reached that address) and the membership in one transaction. The claim is what makes a
  double submit or two simultaneous accepts create one account. If the address registered
  itself meanwhile, the transaction rolls back and the invitation stays open (409).
  Like registering, accepting does not log in; the next step is the login page.
- **One message for every unusable link** (unknown, used, revoked, expired), so a
  stranger cannot tell which tokens once existed.
- **The inviter always gets the link:** shown once with a Copy button after creating, since
  the email may not arrive and the server cannot show the link again.
- **Members page** at `/members` (sidebar, next to Labels): everyone sees the member list
  with role and join date; owners and admins also get the invite form and the pending
  list with Revoke. Open tabs refresh through `org:changed` with a new `members` kind.
- Planned for slice B and decided with the owner: when a member is removed, their issues
  become unassigned, with an audit event for each; their comments and history stay.

## Consequences

- A person who registered on their own cannot be invited into someone else's organization
  yet. This is the main limit, and it is stated in the refusal message.
- Invitation history (who invited whom, accepted, revoked) is stored but not shown; the
  audit log slice can surface it.
- The invite email is sent through the existing wrapper and escapes names, which are
  user-typed.
- No invitation re-send yet: to resend, revoke and invite again (slice B).

## Alternatives rejected

- **Allow existing accounts now:** a second membership with no way to switch organizations
  would hide the user's own organization behind the "first" one.
- **Store the raw token to show "Copy link" anytime:** a database leak would hand out live
  invitations.
- **Put the token in the URL of the public calls:** it would end up in access logs.
- **Auto-login after accepting:** inconsistent with registering and with the existing
  session flow.
