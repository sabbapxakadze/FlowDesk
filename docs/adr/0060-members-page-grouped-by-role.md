# 0060 - The Members page, grouped by role

Status: Accepted - 2026-10-11. A look-only change: no API, contract or data change. Builds on ADR 0024 (members and invitations) and 0028 (profiles).

## Context

The Members page was a flat list of cards with the name, email, role and join date, and the controls on a line of their own under each person. The owner asked for something nicer without touching the API, and picked **"grouped by role"** from four
mockups (people as cards, a table, grouped by role, today's list polished).

## Decisions

1. **One list in one bordered surface, in groups:** "Owner and admins", "Members", "Viewers", each with a heading row and a count; a group with nobody in it is not drawn; the owner is first in the first group. A person's group follows their role, so
   changing a role moves them (they are not just relabelled).
2. **The row:** photo, name with "(you)", the job title and email on a small line under it (the job title was already on the member list, it just was not shown), a pill for owners and admins (the other groups are named by their heading), when they joined,
   and, for someone an owner or admin may change, the role box and Remove at the right (on their own line on a phone). The same rules as before for who gets controls (not yourself, never the owner).
3. **Pending invitations** get the same look: one surface, a dashed "@" mark, the address, who invited and when ("Expired" in the warning colour), the role, Re-send and Revoke. The heading shows the count.
4. **The list keeps its accessible shape:** one list named "Members" whose items are only people. The group headings are rows with `role="presentation"`, not list items, so a screen reader still hears "list, 5 items" and the existing tests and the people count stay true.
5. **Same data, same reads:** `useMembers` and `useInvitations`; the intro line now also says how many people there are.

## Tests

- e2e (`members.spec.ts`, 1 new): the owner's group comes first, the Members group follows, a Viewers group does not exist until someone is a viewer, and changing a person's role through the dropdown moves them to the new group and removes the group they left when it is empty.
  The existing members and member-management specs (invite, accept, resend, revoke, role change, remove) pass unchanged.
- Checked by screenshot of the built page (five people in three groups, two pending invitations) in dark and light at desktop width and in light at 400px.

## Named limits and not verified

- Groups are by role only; there is no search or sort (a list this size does not need one yet).
- The role pill for admins is neutral and for the owner teal; nothing distinguishes members from viewers except their group heading.
- Not looked at in Safari or Firefox.
