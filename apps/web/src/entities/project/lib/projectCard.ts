/**
 * What a project card writes in words. Strings only, so each rule can be checked on its own.
 */

/** The letters in a project's tile: the first letters of its first two words ("Website Redesign" is WR), or the first two letters of a single word ("Marketing" is MA), or the key when the name has neither. */
export function projectInitials(name: string, key: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "").slice(0, 2);
  return (letters || key.slice(0, 2)).toUpperCase();
}

/** "4 days left" for a sprint that ends on `endDate`, counted from `today` (both "YYYY-MM-DD"); null when it has no end date. A sprint that is over says so. */
export function sprintTimeLeft(endDate: string | null, today: string): string | null {
  if (!endDate) return null;
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return "ends today";
  if (days === -1) return "ended yesterday";
  return `ended ${-days} days ago`;
}
