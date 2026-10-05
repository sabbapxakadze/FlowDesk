import { mentionDisplayName, mentionToken, parseMentions } from "@flowdesk/contracts";
import type { MentionRef } from "../../../shared/ui";

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The writer's text (`Hi @Anna Smith`) plus the people they picked, as the stored body (`Hi @[Anna Smith](user:<id>)`).
 * Only a picked name is turned into a token, and only where it stands as a whole `@Name` (not inside a longer word or a
 * longer name), so a hand-typed `@name` stays plain text. Longest names are tried first, so "Anna Smith" wins over "Anna".
 */
export function encodeMentions(text: string, refs: MentionRef[]): string {
  if (refs.length === 0) return text;
  const byName = new Map(refs.map((ref) => [ref.name, ref.id]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])@(${names.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  return text.replace(pattern, (_whole, before: string, name: string) => `${before}${mentionToken(byName.get(name) ?? "", name)}`);
}

/** A stored body back into the writer's text and the people in it (for editing a comment). */
export function decodeMentions(body: string): { text: string; refs: MentionRef[] } {
  const refs: MentionRef[] = [];
  let text = "";
  for (const segment of parseMentions(body)) {
    if (segment.type === "text") {
      text += segment.text;
    } else {
      const name = mentionDisplayName(segment.name);
      text += `@${name}`;
      if (!refs.some((ref) => ref.id === segment.userId)) refs.push({ id: segment.userId, name });
    }
  }
  return { text, refs };
}
