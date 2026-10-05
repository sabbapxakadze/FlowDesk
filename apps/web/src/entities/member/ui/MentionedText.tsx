import { parseMentions } from "@flowdesk/contracts";
import { PersonName } from "./PersonName";

/**
 * A comment body with its @mentions drawn as people (ADR 0033): plain text stays plain text, each mention becomes an `@` and
 * the person's name with the usual hover card and profile link. Someone who has left the organization shows by the name
 * saved in the token, without a link. Built from React nodes only, never HTML, so nothing a writer types can inject markup.
 */
export function MentionedText({ organizationId, body }: { organizationId: string; body: string }) {
  return (
    <>
      {parseMentions(body).map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span key={index} className="font-medium">
            @<PersonName organizationId={organizationId} userId={segment.userId} name={segment.name} />
          </span>
        ),
      )}
    </>
  );
}
