# 0024 — Inviting people to an organization

Status: Accepted — 2026-10-03. Slice A (invite, accept, members list) and slice B
(change a role, remove a member, re-send an invitation, invite a removed person back)
are built; slice B is described under "Slice B" at the end.

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

## Slice B (built 2026-10-03)

- **Roles and rules** (`PATCH` and `DELETE /organizations/:id/members/:userId`, owner or
  admin through `manage_members`): the new role is admin, member or viewer (never owner);
  you cannot change or remove yourself; nobody can change or remove the owner (there is
  exactly one; ownership transfer is its own feature); a user who is not a member of THIS
  organization is a 404, which is also what another organization's id gets. An admin may
  change or remove other admins and members.
- **Removing deletes the membership, never the user.** The user row owns their comments,
  events, attachments and reported issues (all cascade from it), so deleting it would erase
  history. In the same transaction every issue of this organization assigned to them becomes
  unassigned (version bumped) with an `issue.updated` event, payload
  `{ assigneeId: null, reason: "member_removed" }`, actor = the remover, written quietly
  (`notify: false`): a bulk, system-caused change should not ping everyone who ever touched
  those issues. Open boards refresh after the commit.
- **What a removed person sees** (chosen by the owner over creating them a new personal
  organization): their access token stops opening the organization at once (membership is
  checked on every request), and logging in answers 403 `no_organization` ("You are not a member
  of any organization. Ask an owner to invite you again.") instead of the 500 the old
  "this should be impossible" error would have given. The organization check now happens
  before a session row is created, so a refused login leaves nothing behind.
- **Inviting a removed person back:** an email can be invited if it has no account, or an
  account that belongs to no organization. The accept page then says "invited you back" and
  needs no name or password; accepting only adds the membership to the existing account
  (`hasAccount` in the preview). The contract makes name and password optional and the
  service demands them when the account is new. Someone who belongs to another organization is
  still refused.
- **Re-send:** `POST .../invitations/:id/resend` revokes the open invitation and inserts a
  fresh one (new token, new 7 days) for the same email and role in one transaction, emails it
  and returns the link once. It also rescues expired invitations.
- **Fixed on the way:** `auth.service.ts`'s duplicate-key check read the error code from the
  wrong place (drizzle puts it on `err.cause`), so two simultaneous registrations of one email
  gave a 500 for the second; it now gives the intended 409.

### Still open

- A removed person's open browser tab and socket stay connected until they reload (their
  requests fail with 403; the pushes they receive only say "go refetch").
- No ownership transfer, no leaving an organization by yourself, no remembered history of who
  removed whom beyond the issue events (the audit log slice can surface it).
