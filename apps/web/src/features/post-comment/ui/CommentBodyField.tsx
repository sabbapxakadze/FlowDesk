import { useEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import { mentionDisplayName } from "@flowdesk/contracts";
import { memberOptions, useMembers } from "../../../entities/member";
import { MentionTextarea, type MentionRef } from "../../../shared/ui";
import { decodeMentions, encodeMentions } from "../lib/mentions";

/**
 * The comment text box with @mentions (ADR 0033). The outside world sees the STORED body (`Hi @[Anna](user:<id>)`);
 * inside, the writer sees and edits `Hi @Anna`. The two are kept in step: a change the writer makes is encoded and sent up;
 * a body that arrives from outside (cleared after posting, or the comment being edited) is decoded into the box.
 */
export function CommentBodyField({
  organizationId,
  value,
  onChange,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  organizationId: string;
  /** The stored body. */
  value: string;
  onChange: (body: string) => void;
}) {
  const { data: members } = useMembers(organizationId);
  const candidates = useMemo(
    () => memberOptions(members).map((option) => ({ id: option.value, name: mentionDisplayName(option.label), icon: option.icon })),
    [members],
  );
  const [text, setText] = useState(() => decodeMentions(value).text);
  const [refs, setRefs] = useState<MentionRef[]>(() => decodeMentions(value).refs);
  // The last body this field sent up, so only a DIFFERENT body from outside is decoded back into the box.
  const sent = useRef(value);

  useEffect(() => {
    if (value === sent.current) return;
    const decoded = decodeMentions(value);
    sent.current = value;
    setText(decoded.text);
    setRefs(decoded.refs);
  }, [value]);

  return (
    <MentionTextarea
      {...rest}
      value={text}
      refs={refs}
      candidates={candidates}
      onChange={(nextText, nextRefs) => {
        const body = encodeMentions(nextText, nextRefs);
        sent.current = body;
        setText(nextText);
        setRefs(nextRefs);
        onChange(body);
      }}
    />
  );
}
