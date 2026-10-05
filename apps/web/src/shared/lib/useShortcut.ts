import { useEffect, useRef } from "react";

/**
 * A single-key shortcut (no Ctrl, Cmd or Alt), like "C" for "create". It only fires when the person is not typing and
 * nothing modal is in the way, so it never steals a letter:
 *
 * - not while focus is in a field (input, textarea, select, anything editable) or on a button or link that may be
 *   what a key press is meant for;
 * - not with Ctrl, Cmd, Alt or while an input method is composing text;
 * - not while a dialog is open or focus is inside one (the issue panel, the editor popup, the search).
 *
 * The latest `handler` is always used without re-attaching the listener.
 */
export function useShortcut(key: string, handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='combobox']")) return;
      if (target?.closest("dialog, [role='dialog']") || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      latest.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [key]);
}
