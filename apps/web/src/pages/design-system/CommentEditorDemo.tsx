import { useState } from "react";
import { RichTextEditor } from "../../shared/ui";

/**
 * The real comment editor (ADR 0056) on the design-system page: type, use the toolbar or the shortcuts, and see below what is stored. There
 * are no people in this demo, so the `@` list is empty; in the app it lists the organization's members.
 */
export function CommentEditorDemo() {
  const [value, setValue] = useState("Try **bold** (Ctrl+B), *italic* (Ctrl+I), `code` (Ctrl+E), a [link](https://example.com) (Ctrl+Shift+K) or a list:\n\n- first\n- second");
  return (
    <div className="max-w-3xl space-y-3">
      <RichTextEditor value={value} onChange={setValue} ariaLabel="Demo comment" placeholder="Write something…" />
      <div>
        <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">What is stored (the same text the comment card draws)</p>
        <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-[var(--color-bg-page)] p-3 text-xs whitespace-pre-wrap">{value || " "}</pre>
      </div>
    </div>
  );
}
