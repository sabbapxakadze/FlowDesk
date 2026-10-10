# 0058 - Readable addresses for people

Status: Accepted - 2026-10-10. Extends ADR 0030 (projects and issues) to profiles (ADR 0028).

## Context

A profile address was `/people/<the whole user id>`, 36 characters of hex, the one long address left after ADR 0030 made projects and issues readable. The owner
noticed it ("so long url, but we fixed this for issues and other things").

## Decision

- **Address: `/people/daniel-okafor-b50fc811`**: the name, then the first 8 characters of the user id. The name is only for reading. **The person is found by the id part**
  (`parsePersonRef`, `personShortId`, `personPath`, `slugify` in `shared/lib/paths.ts`, strings only like the rest of that file), so a changed name never breaks a link, and a
  link with an old or wrong name still opens the right person.
- **Why not a plain `/people/daniel-okafor`:** there is no unique name to rely on (two people can share one, and names change), and a unique "handle" would need a new column, a
  migration, a uniqueness rule and a way to change it. Eight hex characters of a random uuid are unique within an organization for practical purposes; the lookup takes the first
  member whose id starts with them (not guarded against a collision: with 32 bits and a handful of people it is not a realistic case, but it is not impossible).
- **Names with no A to Z letters** (Georgian, for one) become `person` in the address (`/people/person-b50fc811`), still found by the id part.
- **Resolved once, high up, as in ADR 0030.** `ProfilePage` finds the person in the member list the app already loads, then everything below works with the full id; no endpoint changed.
  Anyone who is not a member (or an id part nobody has) is "Person not found", the same page as before.
- **Old addresses keep working.** A full-id address or a stale name is rewritten once, in place (`replace`), to the current readable one; the page shows its skeleton until then.
- **One place builds the address:** the sidebar's name, the person hover card and the name links (`PersonName`), and the two links on Edit profile all use `personPath`.

## Consequences and limits

- The address changes when someone renames themselves (the old link still works and is rewritten when opened).
- A person's id is part of every address, as before; it is not secret (members already see ids in the app's data). 8 characters, not the whole id.
- The member list must have loaded to open a profile from a short address (a full-id address does not wait for it).

## Tests

- Unit (`paths.test.ts`, 5): `slugify` (case, accents, dashes, the "person" fallback, a length cap), and `personPath` / `parsePersonRef` agreeing, finding by the id part with a wrong name or upper case,
  the old full id, and refusing a 7-character id or no id.
- e2e (`profile.spec.ts`, 1 new): the readable address opens the profile; an old full-id address and a wrong name are both rewritten to it; nonsense and an id part nobody has are "not found".
  The existing profile, photo, back-link and URL specs were updated to the new shape, and the "no link carries a database id" check now covers `/people/` links too.
- Not tested: two people whose ids start alike (the collision above).
