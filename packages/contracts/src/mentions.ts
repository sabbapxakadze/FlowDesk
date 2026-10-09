/**
 * @mentions inside a comment body (ADR 0033). The stored form is a token, `@[Saba Pkhakadze](user:<uuid>)`: the id is the
 * identity, the name is a snapshot for when the person has since left. The API reads the ids from here to decide who is told, and the
 * web reads the same function to render, so the two cannot disagree about what counts as a mention. Anything that does not match the
 * token exactly is plain text.
 */

const TOKEN = /@\[([^\]\n]{1,100})\]\(user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export type MentionSegment = { type: "text"; text: string } | { type: "mention"; userId: string; name: string };

/** Splits a body into plain text and mentions, in order. Joining the text parts and the tokens gives the body back. */
export function parseMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: "text", text: body.slice(last, start) });
    segments.push({ type: "mention", userId: (match[2] ?? "").toLowerCase(), name: match[1] ?? "" });
    last = start + match[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

/** A mention token that starts EXACTLY at `index`, with where it ends; undefined when the text there is not one. Used by the Markdown reader. */
export function mentionTokenAt(text: string, index: number): { end: number; userId: string; name: string } | undefined {
  const sticky = new RegExp(TOKEN.source, "iy");
  sticky.lastIndex = index;
  const match = sticky.exec(text);
  if (!match) return undefined;
  return { end: index + match[0].length, userId: (match[2] ?? "").toLowerCase(), name: match[1] ?? "" };
}

/** The distinct user ids mentioned in a body, in the order they first appear. */
export function mentionedUserIds(body: string): string[] {
  const ids: string[] = [];
  for (const segment of parseMentions(body)) {
    if (segment.type === "mention" && !ids.includes(segment.userId)) ids.push(segment.userId);
  }
  return ids;
}

/** A name as it can sit inside a token: brackets and line breaks would break it, so they are dropped. */
export function mentionDisplayName(name: string): string {
  return name.replace(/[[\]\n\r]/g, "").trim().slice(0, 100) || "someone";
}

/** One mention as the token written into a body. */
export function mentionToken(userId: string, name: string): string {
  return `@[${mentionDisplayName(name)}](user:${userId})`;
}
