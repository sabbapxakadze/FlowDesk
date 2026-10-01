/** "Ada Lovelace" -> "AL", "ada" -> "A". Up to two letters, upper case. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.[0]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}

/**
 * A small circle with a person's initials. The full name is the accessible
 * name and the hover title, so the initials are never the only information.
 */
export function Avatar({ name, label }: { name: string; label?: string }) {
  return (
    <span
      role="img"
      aria-label={label ?? name}
      title={name}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-border-default)] text-[10px] font-medium text-[var(--color-text-default)]"
    >
      {initialsOf(name)}
    </span>
  );
}
