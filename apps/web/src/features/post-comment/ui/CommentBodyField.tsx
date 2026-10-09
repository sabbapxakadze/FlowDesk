import { useMemo } from "react";
import { mentionDisplayName } from "@flowdesk/contracts";
import { memberOptions, useMembers } from "../../../entities/member";
import { RichTextEditor } from "../../../shared/ui";

/**
 * The comment text box (ADR 0033 for @mentions, ADR 0056 for formatting): a rich-text editor that holds the STORED body, the Markdown subset the
 * comment card reads, with `@Name` mentions as the token `@[Name](user:<id>)`. It offers the organization's people when `@` is typed. The
 * editor itself is loaded on demand.
 */
export function CommentBodyField({
  organizationId,
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
}: {
  organizationId: string;
  /** The stored body. */
  value: string;
  onChange: (body: string) => void;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  const { data: members } = useMembers(organizationId);
  const candidates = useMemo(
    () => memberOptions(members).map((option) => ({ id: option.value, name: mentionDisplayName(option.label), icon: option.icon })),
    [members],
  );
  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      candidates={candidates}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      autoFocus={autoFocus}
    />
  );
}
