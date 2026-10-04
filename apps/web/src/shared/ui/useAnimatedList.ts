import { useEffect, useState } from "react";
import { exitMs } from "../lib/motion";

/**
 * How a row should look: first load (staggered rise), just added (opens up and flashes), just removed (closes
 * up), or "stable" (no animation: every row settles to this about a second after it appeared, so a row that is
 * mounted again later, say after an edit form closes, does not replay its entrance).
 */
export type RowState = "initial" | "entering" | "leaving" | "stable";

export interface AnimatedRow<T> {
  key: string;
  item: T;
  state: RowState;
  /** Position in the list, for the staggered entrance. */
  index: number;
}

type Memory<T> = {
  items: T[];
  ready: boolean;
  resetKey: string;
  states: Map<string, "initial" | "entering" | "stable">;
  leaving: { key: string; item: T; index: number }[];
};

/** Same rows in the same order (a fresh array holding the same objects is not a change: it would loop). */
function sameItems<T>(a: T[], b: T[]): boolean {
  return a === b || (a.length === b.length && a.every((item, index) => item === b[index]));
}

/**
 * Turns a list that changes (created, deleted, changed by someone else) into rows that know how to move.
 *
 * - The FIRST data set (`ready` going true) and any change of `resetKey` (a filter, a sort, another page of
 *   results) are not changes: those rows are `initial` and just rise in one after another.
 * - After that, a row whose key is new is `entering`; a row that disappeared is kept, as `leaving`, for the
 *   exit animation and then dropped. Rows whose key stays do not animate, whatever their data does.
 * - Nothing here delays the data: the caller gets the real list plus the few rows still on their way out,
 *   placed where they were.
 *
 * `resetKey` must include everything that replaces the list wholesale (filters, sort) and also the number of
 * loaded pages, so "Load more" is not mistaken for a hundred new rows. The comparison happens while rendering
 * (React's adjust-state-when-inputs-change pattern); the only state change inside an effect is the timer that
 * drops the leaving rows.
 */
export function useAnimatedList<T>(
  items: T[],
  getKey: (item: T) => string,
  options: { ready: boolean; resetKey?: string; exitDelay?: number },
): AnimatedRow<T>[] {
  const { ready, resetKey = "", exitDelay = 220 } = options;
  // A baseline: these rows are "not a change". Rows that were already on screen keep their state (usually
  // stable): marking them "initial" again would replay the entrance on rows that did not move, for instance
  // when "Load more" changes the resetKey.
  const baselineMemory = (before?: Memory<T>): Memory<T> => ({
    items,
    ready,
    resetKey,
    states: new Map(items.map((item) => [getKey(item), before?.states.get(getKey(item)) ?? ("initial" as const)])),
    leaving: [],
  });
  const [memory, setMemory] = useState<Memory<T>>(baselineMemory);

  let current = memory;
  if (!sameItems(memory.items, items) || memory.ready !== ready || memory.resetKey !== resetKey) {
    if (!ready || !memory.ready || resetKey !== memory.resetKey) {
      current = baselineMemory(memory);
    } else {
      const before = new Set(memory.items.map(getKey));
      const after = new Set(items.map(getKey));
      const states = new Map(memory.states);
      for (const item of items) {
        const key = getKey(item);
        if (!before.has(key) && !states.has(key)) states.set(key, "entering");
      }
      const leaving = memory.leaving.filter((row) => !after.has(row.key));
      memory.items.forEach((item, index) => {
        const key = getKey(item);
        if (!after.has(key) && !leaving.some((row) => row.key === key)) leaving.push({ key, item, index });
      });
      current = { ...memory, items, ready, resetKey, states, leaving };
    }
    setMemory(current);
  }

  const leavingCount = current.leaving.length;
  useEffect(() => {
    if (leavingCount === 0) return;
    const timer = window.setTimeout(
      () => setMemory((m) => ({ ...m, leaving: [] })),
      exitMs(exitDelay) + 30,
    );
    return () => window.clearTimeout(timer);
  }, [leavingCount, current.leaving, exitDelay]);

  // Everything settles to "stable" a second after it appeared.
  const unsettled = [...current.states.values()].some((state) => state !== "stable");
  useEffect(() => {
    if (!unsettled) return;
    const timer = window.setTimeout(
      () => setMemory((m) => ({ ...m, states: new Map([...m.states.keys()].map((key) => [key, "stable" as const])) })),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [unsettled, current.states]);

  const rows: AnimatedRow<T>[] = items.map((item, index) => {
    const key = getKey(item);
    return { key, item, state: current.states.get(key) ?? "initial", index };
  });
  for (const row of [...current.leaving].sort((a, b) => a.index - b.index)) {
    rows.splice(Math.min(row.index, rows.length), 0, { key: row.key, item: row.item, state: "leaving", index: row.index });
  }
  return rows;
}
