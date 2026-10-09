import { lazy, Suspense } from "react";
import type { RichTextEditorProps } from "./rich-text/RichTextEditorImpl";
import { cn } from "./lib/cn";

export type { RichTextEditorProps } from "./rich-text/RichTextEditorImpl";

// The editor library is about 150 KB of download (measured with a scratch bundle, ADR 0056), so it is fetched only when a comment box is shown.
const Impl = lazy(() => import("./rich-text/RichTextEditorImpl"));

/** The same frame as the editor, shown for the moment the library is still arriving, so the page does not jump when it appears. */
function EditorLoading({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div
        role="status"
        className={cn(
          "min-h-[7.5rem] rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]",
        )}
      >
        Loading the editor…
      </div>
    </div>
  );
}

/**
 * The comment editor with bold, italic and so on (ADR 0056); see `rich-text/RichTextEditorImpl.tsx` for what it does. This wrapper only loads
 * it on demand.
 */
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<EditorLoading className={props.className} />}>
      <Impl {...props} />
    </Suspense>
  );
}
