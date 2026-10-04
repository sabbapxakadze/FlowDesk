/**
 * Readable addresses (ADR 0030): a project is its key (`/projects/WEB`), an issue is its key
 * (`/projects/WEB/issues/WEB-12`, or `?issue=WEB-12` for the side panel). Strings only, no domain
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
