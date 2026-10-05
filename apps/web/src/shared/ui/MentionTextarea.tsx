import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "./lib/cn";
import { Textarea } from "./Textarea";

export type MentionCandidate = { id: string; name: string; icon?: ReactNode };
/** A person the writer picked: the text holds `@name`, this remembers WHICH person it meant. */
export type MentionRef = { id: string; name: string };

const MAX_SHOWN = 8;
const LIST_MAX_HEIGHT = 224;

/** The `@` the caret is just after (at the start or after whitespace) and what was typed since, or null. */
function findTrigger(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query)) return null;
  return { start: at, query };
}

/**
 * A textarea where typing `@` opens a list of people under it (ADR 0033). The text holds a readable `@Name`; the people
 * actually picked are remembered in `refs`, so the caller can turn them into whatever it stores. A name typed by hand, or one
 * edited after picking, is just text. Controlled: `value`, `refs` and `onChange(value, refs)`.
 *
 * The list is the usual listbox pattern with focus kept in the textarea (aria-controls, aria-activedescendant): Down/Up move,
 * Enter or Tab choose, Esc closes ONLY the list (the text stays, and a panel or dialog behind it stays open). Like the
 * Dropdown's list it is `position: fixed` from the box's measured position, so a scrolling area never clips it, and it closes on a
 * click outside, a resize, or a scroll elsewhere (the textarea's own scrolling excluded). Domain-free: the caller supplies the people.
 */
export function MentionTextarea({
  value,
  refs,
  onChange,
  candidates,
  className,
  onKeyDown,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  refs: MentionRef[];
  onChange: (value: string, refs: MentionRef[]) => void;
  candidates: MentionCandidate[];
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});
  // Esc (or a click away) closes the list for THIS `@` until the writer starts another one.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const query = trigger?.query.toLowerCase() ?? "";
  const matches = trigger
    ? candidates
        .filter((c) => c.name.toLowerCase().includes(query))
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)))
        .slice(0, MAX_SHOWN)
    : [];
  const open = trigger !== null && matches.length > 0 && dismissedAt !== trigger.start;
  const optionId = (index: number) => `${listId}-${index}`;

  function detect(text: string, caret: number) {
    const next = findTrigger(text, caret);
    if (!next || next.start !== dismissedAt) setDismissedAt(null);
    setTrigger(next);
    setActive(0);
  }

  // Place the list under the box (or above when there is more room there), from the box's measured position.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const flip = below < Math.min(LIST_MAX_HEIGHT, matches.length * 36 + 12) && rect.top > below;
    setPlace(
      flip
        ? { position: "fixed", left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4 }
        : { position: "fixed", left: rect.left, width: rect.width, top: rect.bottom + 4 },
    );
  }, [open, matches.length, value]);

  // After choosing, put the caret just after the inserted name once React has written the new text.
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && box.current) {
      box.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  const triggerStart = trigger?.start ?? null;
  useEffect(() => {
    if (!open) return;
    function dismiss() {
      setDismissedAt(triggerStart);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (list.current?.contains(target) || box.current?.contains(target)) return;
      dismiss();
    }
    function onScroll(event: Event) {
      if (event.target !== box.current && !list.current?.contains(event.target as Node)) dismiss();
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, triggerStart]);

  function choose(candidate: MentionCandidate) {
    const el = box.current;
    if (!el) return;
    const current = findTrigger(value, el.selectionStart);
    if (!current) return;
    const insert = `@${candidate.name} `;
    const next = value.slice(0, current.start) + insert + value.slice(el.selectionStart);
    const person: MentionRef = { id: candidate.id, name: candidate.name };
    pendingCaret.current = current.start + insert.length;
    setTrigger(null);
    onChange(next, [...refs.filter((r) => r.id !== person.id), person]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const picked = matches[active];
        if (picked) choose(picked);
        return;
      }
      if (event.key === "Escape") {
        // Closes only the list: not a side panel or dialog behind it, and the text stays.
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(triggerStart);
        return;
      }
    }
    onKeyDown?.(event);
  }

  return (
    <>
      <Textarea
        {...rest}
        ref={box}
        value={value}
        className={className}
        onChange={(event) => {
          const text = event.target.value;
          // Forget a person whose `@Name` is no longer in the text (deleted or edited by hand).
          onChange(
            text,
            refs.filter((r) => text.includes(`@${r.name}`)),
          );
          detect(text, event.target.selectionStart);
        }}
        onSelect={(event) => detect(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
      />
      {open && (
        <div
          ref={list}
          style={place}
          // Pressing on a row must not pull focus (and the caret) out of the textarea.
          onMouseDown={(event) => event.preventDefault()}
          className="motion-drop-in z-50 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1 text-[var(--color-text-default)] shadow-lg"
        >
          <ul id={listId} role="listbox" aria-label="Mention a person" className="scrollbar-list-always max-h-56 overflow-y-auto">
            {matches.map((candidate, index) => (
              <li
                key={candidate.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => active !== index && setActive(index)}
                onClick={() => choose(candidate)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm",
                  index === active && "bg-[var(--color-border-default)]",
                )}
              >
                {candidate.icon && (
                  <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                    {candidate.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
