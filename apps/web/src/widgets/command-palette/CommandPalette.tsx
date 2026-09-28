import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useProjects } from "../../entities/project";
import { useSearch, type Issue } from "../../entities/issue";
import { Input, StatusBadge } from "../../shared/ui";
import { useAuth } from "../../shared/auth/useAuth";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * A plain <button> row, not entities/issue's IssueCard — IssueCard's
 * <Link> only covers pointer clicks, and this palette needs one
 * selection model that also covers arrow-key + Enter (see the plan's
 * "Decisions"). Clicking or Enter-ing a highlighted row both call the
 * same onSelect.
 */
function ResultRow({
  issue,
  projectKey,
  highlighted,
  onSelect,
}: {
  issue: Issue;
  projectKey: string;
  highlighted: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-control)] px-3 py-2 text-left ${
        highlighted ? "bg-[var(--color-bg-page)]" : ""
      }`}
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        {projectKey}-{issue.number}
      </p>
      <p className="font-medium">{issue.title}</p>
      <StatusBadge status={issue.status} />
    </button>
  );
}

/**
 * Mounted once in App.tsx, inside BrowserRouter. Renders nothing (and
 * the Ctrl+K/Cmd+K shortcut is a no-op) while logged out — searching org
 * data makes no sense pre-login, and useSearch needs a real org id.
 */
export function CommandPalette() {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const debouncedQuery = useDebouncedValue(query, 250);
  const { data: projects } = useProjects(organization?.id ?? "", { enabled: !!organization });
  const { data: results } = useSearch(organization?.id ?? "", organization ? debouncedQuery : "");

  const rows = results ?? [];

  function close() {
    setIsOpen(false);
    setQuery("");
    setHighlightedIndex(0);
  }

  function select(issue: Issue) {
    close();
    navigate(`/projects/${issue.projectId}/issues/${issue.id}`);
  }

  // Keep the <dialog> element's own open/closed state (and its native
  // Escape/backdrop handling) in sync with isOpen.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Reset local state whenever the dialog closes, whether that happened
  // via close()/select() above or the native Escape/backdrop-click path
  // (dialog's own "close" event, not something this component drove).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setIsOpen(false);
      setQuery("");
      setHighlightedIndex(0);
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  useEffect(() => {
    if (!organization) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [organization]);

  if (!organization) return null;

  // Rows can shrink out from under a stale index (new results arriving
  // after the debounce, or typing further narrowing the match set) —
  // clamped at render time instead of a setState-in-effect reset.
  const highlightedRow = Math.min(highlightedIndex, Math.max(rows.length - 1, 0));

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const issue = rows[highlightedRow];
      if (issue) select(issue);
    }
  }

  const trimmed = query.trim();

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-0 text-[var(--color-text-default)] backdrop:bg-black/40"
      aria-label="Command palette"
    >
      <div className="flex flex-col gap-2 p-3">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search issues by title or description…"
          aria-label="Search issues"
        />

        {trimmed !== "" && (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {rows.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No issues match "{trimmed}".</p>
            ) : (
              rows.map((issue, i) => {
                const projectKey = projects?.find((p) => p.id === issue.projectId)?.key ?? "?";
                return (
                  <li key={issue.id}>
                    <ResultRow
                      issue={issue}
                      projectKey={projectKey}
                      highlighted={i === highlightedRow}
                      onSelect={() => select(issue)}
                    />
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </dialog>
  );
}
