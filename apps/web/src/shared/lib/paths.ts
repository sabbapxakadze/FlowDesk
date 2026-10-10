/**
 * Readable addresses (ADR 0030): a project is its key (`/projects/WEB`), an issue is its key
 * (`/projects/WEB/issues/WEB-12`, or `?issue=WEB-12` for the side panel), a person is their name and the start of
 * their id (`/people/daniel-okafor-b50fc811`, ADR 0058). Strings only, no domain
 * types, so every place that builds an address uses the same functions and shared stays domain-free.
 *
 * Old addresses carried database ids; they are still understood (see `isUuid`, `parseIssueRef`) and
 * rewritten to the readable form once the page knows the key.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type ProjectPage = "board" | "sprints" | "analytics" | "settings";

/** `/projects/WEB`, or `/projects/WEB/board` and so on. */
export function projectPath(projectKey: string, page?: ProjectPage): string {
  return `/projects/${projectKey}${page ? `/${page}` : ""}`;
}

/** "WEB-12": what a person sees on a card. */
export function issueKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/** The full issue page: `/projects/WEB/issues/WEB-12`. */
export function issuePath(projectKey: string, number: number): string {
  return `/projects/${projectKey}/issues/${issueKey(projectKey, number)}`;
}

/** The project list with the side panel open on an issue: `/projects/WEB?issue=WEB-12`. */
export function issuePanelPath(projectKey: string, number: number): string {
  return `${projectPath(projectKey)}?issue=${issueKey(projectKey, number)}`;
}

export type IssueRef =
  | { kind: "uuid"; id: string }
  /** `prefix` is the project key typed in the address (null for a bare number). */
  | { kind: "number"; prefix: string | null; number: number }
  | { kind: "invalid" };

/**
 * What an address (or `?issue=`) says about an issue: an old id, a key ("WEB-12"), or just a number
 * ("12"). Anything else, and numbers too long to be real, are "invalid", which the page shows as not found.
 */
export function parseIssueRef(value: string): IssueRef {
  if (isUuid(value)) return { kind: "uuid", id: value };
  const keyed = /^([A-Za-z0-9]+)-([0-9]{1,9})$/.exec(value);
  if (keyed) return { kind: "number", prefix: keyed[1]!, number: Number(keyed[2]) };
  const bare = /^[0-9]{1,9}$/.exec(value);
  if (bare) return { kind: "number", prefix: null, number: Number(value) };
  return { kind: "invalid" };
}

/**
 * A name as it can sit in an address: lower case, accents dropped, anything that is not a letter or digit (a space, a dot, a
 * letter outside A to Z such as Georgian) turned into a single dash. Nothing usable left gives "person". It is only for reading:
 * a person is found by the id part of the address, so a name that changes never breaks a link.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "person" : slug.slice(0, 40).replace(/-+$/, "");
}

/** The first group of a user id: 8 hex characters, enough to tell the people of one organization apart. */
export function personShortId(userId: string): string {
  return userId.slice(0, 8).toLowerCase();
}

/** `/people/daniel-okafor-b50fc811`: what a person's profile is called in an address (name for reading, id start for finding). */
export function personPath(name: string, userId: string): string {
  return `/people/${slugify(name)}-${personShortId(userId)}`;
}

export type PersonRef =
  | { kind: "uuid"; id: string }
  /** `short` is the 8 characters at the end of the address. */
  | { kind: "short"; short: string }
  | { kind: "invalid" };

/** What an address says about a person: an old full id, or name-plus-id-start (the name part is never used to look anyone up). */
export function parsePersonRef(value: string): PersonRef {
  if (isUuid(value)) return { kind: "uuid", id: value };
  const short = /(?:^|-)([0-9a-f]{8})$/i.exec(value);
  if (short) return { kind: "short", short: short[1]!.toLowerCase() };
  return { kind: "invalid" };
}
