# 0028 — Profiles and profile photos

Status: Accepted — 2026-10-03.

## Context

People were a name and two initials. The owner wanted a photo, a job title and a short bio, a
page to edit them, and a page to see other people's (design pass: option P2, an identity card at
the left, About and Recent activity at the right, no "Assigned to them" card). Two things needed
a real decision: where a photo lives and who may load it (attachment links expire after 5 minutes,
which is wrong for a picture shown in every list), and what an activity list may reveal.

## Decision

- **Fields on `users`** (migration 0022, all nullable): `job_title` (100), `bio` (300), `avatar_key`
  (64). The name is edited with them. Email is shown and not editable here (changing it is a
  security flow of its own).
- **A photo is a capability URL.** `GET /api/v1/avatars/:key` needs no login; the key is 32 random
  hex characters created on every upload, so the URL cannot be guessed or listed, and a replaced
  photo gets a new URL that can be cached as `immutable` for a year. A key that no user owns (a
  replaced or removed photo, a guess, a malformed value) answers 404 even if a file were left on
  disk. Rejected: an authenticated route (an `<img>` tag cannot send the bearer token) and an
  expiring signed URL (every cached list and page would break after five minutes). Trade-off: anyone
  who is handed the URL can see that picture. A profile picture is shown to the whole
  organization anyway, and removing it ends the access.
- **The upload is re-made, not stored.** `lib/image.ts` decodes it with `sharp` (this is the real
  validation: the browser's MIME type is only a claim, so a text file named .png is refused as
  `invalid_image`), applies the camera rotation, centre-crops to 256x256, re-encodes to WebP and
  drops metadata (EXIF, GPS). The original is never kept. Input limit 5 MB, PNG/JPEG/WebP, and a
  40-megapixel decode cap. The file is written first, then the row is switched (inside a
  transaction that locks the user's row so two uploads cannot orphan a file), then the old file is
  deleted. Stored through `lib/storage.ts`, the same seam real S3 would replace.
- **Who sees a profile:** members of the same organization, any role (a viewer too). The query joins
  `organization_members`, so someone from another organization, or someone who was removed, is a
  404 (the middleware answers 403 when the URL names an organization you are not in).
- **Recent activity** comes from `issue_events` (actor = that person), scoped by the issue's
  organization, newest first, a keyset cursor on (created_at, id). It is served trimmed: a
  comment's text and a description's text are removed from the payload, because a deleted comment's
  original text stays in its stored event (ADR 0019) and must never be served. Issues deleted since
  have no events, so their lines are gone. Each line links to the issue's project page with the
  side panel open (`?issue=`).
- **Names elsewhere:** lists read `users.name` live, so a rename appears everywhere after a refetch;
  after any change the server tells every organization the person belongs to (`org:changed`, kind
  `members`) and open tabs refetch. The audit log (ADR 0027) and stored event payloads keep the name
  as it was, on purpose.
- **Web:** `Avatar` takes a `src` and falls back to initials when it is missing or fails to load
  (sizes `lg` and `xl` added); the hover card shows the photo, job title and a "View profile" link
  (`PersonHover` takes plain props, `PersonName` fills them from the member list); the sidebar's
  name block is a link to your own profile and reads the member list so an edit shows at once.
  Routes: `/people/:userId` (view) and `/profile` (edit). A photo applies the moment it is chosen,
  not on Save.

## Consequences

- One new dependency, `sharp` (native binaries).
- The photo URL is public to anyone holding it; see the trade-off above.
- Photos are not yet shown on the small assignee circle of issue cards (they pass a name only).
- No cleanup of a user's photo when a user is deleted: nothing deletes users yet.
- Live updates cover the member list and open profile pages; a stale hover card refreshes on its
  next fetch.
- The sign-up nudge is slice 3, below.

## Alternatives rejected

- **Signed, expiring photo URLs** and **an authenticated photo route**: see above.
- **Storing the original and resizing on read:** more storage, a resize on every request, and the
  original (with its metadata) kept for no reason.
- **A required profile step at sign-up:** friction at the most fragile moment, and people type filler.

## Amendment 2026-10-04: the "Finish your profile" card (slice 3)

- Sign-up and invitation-accept stay as short as they were. A small dismissible card at the top of
  Projects (the owner's mock N) invites the person to add a photo and a line about themselves.
- The server decides: `GET /users/me/profile-nudge` answers `{ show }`, true only while there is no
  photo, no job title and no bio, and the person has not pressed "Not now". Filling in any of the
  three hides it by itself; clearing them all brings it back unless it was dismissed.
- "Not now" (`POST /users/me/profile-nudge/dismiss`, idempotent) is stored on the account in
  `users.profile_nudge_dismissed_at` (migration 0023), not in the browser, so it holds across
  devices and reloads and never returns. Rejected: localStorage (per browser, lost on clearing).
- Invited people who join through an invitation see it too, like everyone with a bare profile.
