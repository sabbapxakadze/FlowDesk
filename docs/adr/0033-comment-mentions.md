# 0033 - @mentions in comments

Status: Accepted - 2026-10-05.

## Context

People could not call someone into a conversation: a notification only reached the people who had already acted on an issue
(and its assignee, ADR 0021). The owner asked for @mentions and picked: comments only for now (the description is a follow-up),
a mentioned person is notified even if they never touched the issue, and also when a comment is EDITED to add them, and the
list of people opens under the comment box.

## Decision

- **The stored body holds a token**: `@[Saba Pkhakadze](user:<uuid>)`. The id is the identity; the name is a snapshot, so a
  person who has since left the organization still reads as a name (without a link), like the name snapshots in the audit log.
  Anything that does not match the token exactly is plain text. The parser lives in `packages/contracts/src/mentions.ts`
  (`parseMentions`, `mentionedUserIds`, `mentionToken`), used by the API to decide who is told and by the web to render, so the
  two cannot disagree.
- **The box shows `@Saba Pkhakadze`, not the token.** Picking a person inserts a readable name and remembers the id; on send the
  text is encoded to tokens, on edit the tokens are decoded back (`features/post-comment/lib/mentions.ts`). A name typed by hand,
  or edited after picking, stays plain text: it can never link to, or notify, the wrong person.
- **Rendering builds React nodes, never HTML** (`entities/member/ui/MentionedText`): each mention is `@` plus the existing
  `PersonName` (hover card, profile link). No Markdown library, no `dangerouslySetInnerHTML`.
- **The server never trusts the ids.** They come from text the client sent, so they are filtered to CURRENT members of the issue's
  organization (`findMember`) in the service. A made-up id or a person from another organization is ignored: the comment still posts,
  nobody is told. (The notification SQL does not check membership itself; the service is the check.)
- **Who is told.** A new comment: the mentioned join the usual participants and the assignee through `alsoNotifyUserIds`; one
  person who is both gets one notification. An EDIT: only people the edit ADDS (mentioned in the new text, not in the one it
  replaces) are told, through a new `notifyOnly` option and `createForUsers` in the notifications repository; nobody else is
  told, and an edit that adds nobody stays silent. The writer is never told about their own mention. Both comment events carry
  `mentions: [ids]` in their payload; the bell and My work read it to say "mentioned you in a comment" (`describeEventFor`).
- **This is a named, deliberate exception to ADR 0019** ("edits never notify"): without it a mention added in a quick fix would be
  silently lost, and mentioning is an explicit act aimed at one person.
- **No schema change.** Comments are not part of `search_vector`; analytics ignores comment events; the public profile activity
  feed returns `{}` for comment events, so `mentions` is not exposed there.

## Trade-offs, named

- Two people with exactly the same display name resolve to whichever was picked last within one comment (the text cannot tell them
  apart). Rare in a small team; a later fix is a disambiguating label in the list.
- The list opens under the box, not at the caret (no caret measuring in the app yet).
- Adding someone, removing them in a later edit, then adding them again notifies again.
- A notification about an edited comment shows no comment excerpt (the stored event may hold the old text).
- Not in this slice: mentions in the issue description (needs a change to its search column and event payload), `@everyone`,
  Markdown.

## Alternatives rejected

- A separate `mentions` table: a second place to keep in step with the text; the body already says who is mentioned.
- Storing a bare `@Name` and finding the person by name on the server: names repeat and change.
- A rich-text editor: a large dependency and a new content format for one feature.
