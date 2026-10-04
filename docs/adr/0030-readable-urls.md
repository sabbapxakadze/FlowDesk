# 0030 — Readable URLs

Status: Accepted — 2026-10-04.

## Context

Every project and issue address carried a database id:
`/projects/ddf74d71-de4d-45cc-b134-2b58c02ba16c?issue=f13ef43a-9543-4ad0-8bdd-2f7f8991d3cd`. The owner wanted the
keys people already read on cards (`WEB`, `WEB-12`) in the address bar.

## Decision

- **Addresses:** `/projects/WEB` (list), `/projects/WEB/board|sprints|analytics|settings`, the full issue page
  `/projects/WEB/issues/WEB-12`, and the side panel `?issue=WEB-12`. An issue is named by its KEY, with the number
  part doing the lookup.
- **Keys are safe to use** because a project key is unique inside an organization, uppercase, 2-10 letters and
  digits, and immutable (ADR 0022), and an issue number is per project and never reused (deleting an issue does not
  free its number; tested). So an old link to a deleted issue is "not found", never a different issue.
- **Ids stay the identity inside the app and the API.** Nothing about query keys, sockets or endpoints changed. The
  address is resolved ONCE, high up, and everything below carries on with ids:
  - `ProjectRoute` (layout route `/projects/:projectKey`) finds the project in the project list the app already
    caches (key, case-insensitive), shows the skeleton while it loads, one "Project not found" page when there is none,
    and hands the project to its child pages (`useCurrentProject`), which no longer have their own loading,
    not-found or id code.
  - `IssueByKey` finds the issue (`GET .../issues/by-number/:number`, the one new endpoint: same payload and checks
    as the id read, scoped by organization and project; a bad or missing number is 404, never 500) and renders the
    existing `IssueDetail` with its id. A key whose project part is not this project's key is not found without
    asking the server.
- **Old addresses keep working.** An address or `?issue=` carrying ids still opens and is rewritten once
  (`replace`, so Back does not bounce) to the readable form, as is a lowercase key. The page shows its skeleton until
  the rewrite has happened, so it is not mounted twice.
- **One place builds addresses:** `shared/lib/paths.ts` (`projectPath`, `issuePath`, `issuePanelPath`, `issueKey`,
  `parseIssueRef`), strings only so `shared` stays domain-free. Cards, the sidebar, notifications, the search palette,
  profile activity and the panel use it; a test fails if any link on the main pages still carries an id.

## Consequences

- A project key can never be changed without breaking links (it was already immutable).
- A link shared before this change keeps working only while the project and issue still exist.
- Resolving an issue from a deep link costs one request (by number); the result also fills the normal issue cache, so
  the page does not fetch it twice. A card click needs none (the card already knows the key).
- The sockets, query keys and every API route keep using ids; only the address changed.

## Alternatives rejected

- **Letting the API accept keys everywhere:** the web would pass the URL text straight into hooks, so query keys,
  invalidation and socket rooms would see two spellings of one project.
- **Short random ids or slugs:** a new column and backfill, and no more readable than the key.
- **Keeping the ids and hiding them with router state:** breaks reload, sharing and Back.
