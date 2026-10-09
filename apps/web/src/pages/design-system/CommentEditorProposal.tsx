import { useState } from "react";
import { Bold, Code, Italic, Link2, List, ListOrdered, Strikethrough } from "lucide-react";
import { Avatar, Button, Card, IconButton, cn } from "../../shared/ui";

/**
 * PROPOSAL, not built: formatted comments (bold, italic and so on), shown here with the real components and tokens so the look can be judged
 * before any code is written. Nothing on it changes a comment; the toolbar buttons are inert and only the Write / Preview switch works.
 * Remove this file (and its Section in DesignSystemPage) when the feature is built or dropped.
 */

const TOOLS = [
  { label: "Bold", shortcut: "Ctrl+B", icon: Bold },
  { label: "Italic", shortcut: "Ctrl+I", icon: Italic },
  { label: "Strikethrough", shortcut: "Ctrl+Shift+X", icon: Strikethrough },
  { label: "Code", shortcut: "Ctrl+E", icon: Code },
  { label: "Link", shortcut: "Ctrl+K", icon: Link2 },
] as const;

const LIST_TOOLS = [
  { label: "Bulleted list", shortcut: "Ctrl+Shift+8", icon: List },
  { label: "Numbered list", shortcut: "Ctrl+Shift+7", icon: ListOrdered },
] as const;

function Toolbar({ pressed }: { pressed?: string }) {
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      {TOOLS.map(({ label, shortcut, icon: Icon }) => (
        <IconButton
          key={label}
          label={`${label} (${shortcut})`}
          title={`${label}  ${shortcut}`}
          aria-pressed={pressed === label}
          className={cn(pressed === label && "bg-[var(--color-border-default)] text-[var(--color-text-default)]")}
        >
          <Icon size={15} aria-hidden="true" />
        </IconButton>
      ))}
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-[var(--color-border-default)]" />
      {LIST_TOOLS.map(({ label, shortcut, icon: Icon }) => (
        <IconButton key={label} label={`${label} (${shortcut})`} title={`${label}  ${shortcut}`}>
          <Icon size={15} aria-hidden="true" />
        </IconButton>
      ))}
    </div>
  );
}

/** What a formatted comment looks like once drawn (the same for Write-then-Preview, option B's editor and a posted comment). */
function Rendered() {
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="font-medium">@Anna</span>, this is <strong>important</strong>: the <em>second</em> run is <s>slower</s> faster after I
        changed <code className="rounded bg-[var(--color-bg-page)] px-1 py-0.5 font-mono text-[0.85em]">retries: 1</code>. Details in{" "}
        <a href="#comment-formatting" className="underline underline-offset-2">
          the CI notes
        </a>
        .
      </p>
      <ul className="list-disc pl-5">
        <li>Check the flaky Ctrl+click test</li>
        <li>Re-run all four shards</li>
      </ul>
    </div>
  );
}

const WRITE_TEXT = `@Anna, this is **important**: the *second* run is ~~slower~~ faster after I changed \`retries: 1\`. Details in [the CI notes](https://example.com/ci).

- Check the flaky Ctrl+click test
- Re-run all four shards`;

function EditorFrame({ children, toolbarExtra, pressed }: { children: React.ReactNode; toolbarExtra?: React.ReactNode; pressed?: string }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-default)] px-2 py-1.5">
        <Toolbar pressed={pressed} />
        {toolbarExtra}
      </div>
      {children}
    </div>
  );
}

function OptionA() {
  const [mode, setMode] = useState<"write" | "preview">("write");
  return (
    <div className="space-y-3">
      <EditorFrame
        pressed="Bold"
        toolbarExtra={
          <div role="group" aria-label="Write or preview" className="flex gap-1">
            <Button type="button" size="sm" variant={mode === "write" ? "secondary" : "link"} aria-pressed={mode === "write"} onClick={() => setMode("write")}>
              Write
            </Button>
            <Button type="button" size="sm" variant={mode === "preview" ? "secondary" : "link"} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>
              Preview
            </Button>
          </div>
        }
      >
        {mode === "write" ? (
          <pre className="m-0 min-h-[8rem] whitespace-pre-wrap p-3 font-sans text-sm">{WRITE_TEXT}</pre>
        ) : (
          <div className="min-h-[8rem] p-3">
            <Rendered />
          </div>
        )}
      </EditorFrame>
      <p className="text-xs text-[var(--color-text-muted)]">
        Select text and click a button, or press the shortcut (Cmd instead of Ctrl on a Mac). With nothing selected the markers are inserted around
        the cursor. Hover a button for its shortcut. Markdown is what is stored, so a comment stays readable as plain text anywhere.
      </p>
    </div>
  );
}

function OptionB() {
  return (
    <div className="space-y-3">
      <EditorFrame pressed="Bold">
        <div className="min-h-[8rem] p-3">
          <Rendered />
        </div>
      </EditorFrame>
      <p className="text-xs text-[var(--color-text-muted)]">
        The text looks formatted while you type, no Preview. Same toolbar and shortcuts. It needs an editor library, and the @mention picker, editing a
        comment, the stored format and the notification text all have to be reworked around it.
      </p>
    </div>
  );
}

function PostedComment() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-bg-page)] px-3 py-1.5 text-sm">
        <Avatar name="Saba Pkhakadze" size="sm" />
        <span className="font-medium">Saba Pkhakadze</span>
        <span className="text-xs text-[var(--color-text-muted)]">2 minutes ago</span>
      </div>
      <div className="p-3">
        <Rendered />
      </div>
    </Card>
  );
}

export function CommentEditorProposal() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Option A (recommended): toolbar over a Markdown text box, with Write and Preview</h3>
        <OptionA />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Option B: formatted while you type (rich-text editor)</h3>
        <OptionB />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">A posted comment, the same in both options</h3>
        <PostedComment />
      </div>
    </div>
  );
}
