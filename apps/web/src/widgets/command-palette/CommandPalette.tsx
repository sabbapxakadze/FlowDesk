import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useProjects } from "../../entities/project";
import { IssueSummary, useSearch, type Issue } from "../../entities/issue";
import { Input, StatusBadge } from "../../shared/ui";
import { useAuth } from "../../shared/auth/useAuth";
import { useSearchPalette } from "../../shared/search-palette/useSearchPalette";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * A plain <button> row, not entities/issue's IssueCard — IssueCard's
 * <Link> only covers pointer clicks, and this palette needs one
 * selection model that also covers arrow-key + Enter (see the plan's
 * "Decisions"). Clicking or Enter-ing a highlighted row both call the
 * same onSelect.
 */
function ResultRow({
  id,
  issue,
  projectKey,
  highlighted,
  onSelect,
}: {
  id: string;
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
      id={id}
      type="button"
      role="option"
      aria-selected={highlighted}
      tabIndex={-1}
      onClick={onSelect}
      className={`flex w-full items-start rounded-[var(--radius-control)] px-3 py-2 text-left hover:bg-[var(--color-border-default)] ${
        highlighted ? "bg-[var(--color-border-default)]" : ""
      }`}
    >
      <IssueSummary issue={issue} projectKey={projectKey}>
        <div className="mt-1.5">
          <StatusBadge status={issue.status} />
        </div>
      </IssueSummary>
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
  const listId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isOpen, setOpen: setIsOpen } = useSearchPalette();
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

  function showAll() {
    const q = query.trim();
    close();
    navigate(`/search?q=${encodeURIComponent(q)}`);
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
    // Depends on `organization` because the <dialog> is not rendered while
    // logged out (see the early return below): with no dependency this ran
    // once at mount, found no dialog, and never attached after a login
    // without a reload, so Esc closed the dialog but left isOpen true and the
    // next Ctrl+K only toggled it back to false.
  }, [organization, setIsOpen]);

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
  }, [organization, setIsOpen]);

  if (!organization) return null;

  // Rows can shrink out from under a stale index (new results arriving
  // after the debounce, or typing further narrowing the match set) —
  // clamped at render time instead of a setState-in-effect reset.
  // The "Show all results" row is one extra keyboard stop after the issues,
  // present only when there are results to show.
  const hasShowAll = query.trim() !== "" && rows.length > 0;
  const lastIndex = rows.length - 1 + (hasShowAll ? 1 : 0);
  const highlightedRow = Math.min(highlightedIndex, Math.max(lastIndex, 0));
  const showAllHighlighted = hasShowAll && highlightedRow === rows.length;

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, lastIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showAllHighlighted) {
        showAll();
        return;
      }
      const issue = rows[highlightedRow];
      if (issue) select(issue);
    }
  }

  const trimmed = query.trim();
  const showList = trimmed !== "" && rows.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className="mx-auto mt-24 mb-auto w-full max-w-lg rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-0 text-[var(--color-text-default)] shadow-lg backdrop:bg-black/40"
      aria-label="Command palette"
      // The dimmed backdrop belongs to the <dialog> itself, so a click on it has
      // the dialog as its target; clicks on the content inside have a child as
      // target. A native <dialog> only closes on Esc, so this adds the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
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
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-option-${highlightedRow}` : undefined}
        />

        {trimmed !== "" && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Search results"
            className="flex max-h-80 flex-col gap-1 overflow-y-auto"
          >
            {rows.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No issues match "{trimmed}".</li>
            ) : (
              rows.map((issue, i) => {
                const projectKey = projects?.find((p) => p.id === issue.projectId)?.key ?? "?";
                return (
                  <li key={issue.id} role="presentation">
                    <ResultRow
                      id={`${listId}-option-${i}`}
                      issue={issue}
                      projectKey={projectKey}
                      highlighted={i === highlightedRow}
                      onSelect={() => select(issue)}
                    />
                  </li>
                );
              })
            )}
            {hasShowAll && (
              <li role="presentation">
                <button
                  id={`${listId}-option-${rows.length}`}
                  type="button"
                  role="option"
                  aria-selected={showAllHighlighted}
                  tabIndex={-1}
                  onClick={showAll}
                  className={`w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-[var(--color-text-link)] hover:bg-[var(--color-border-default)] ${
                    showAllHighlighted ? "bg-[var(--color-border-default)]" : ""
                  }`}
                >
                  Show all results for "{trimmed}"
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="border-t border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
        Up and Down to move, Enter to open, Esc to close
      </p>
    </dialog>
  );
}
