import { useState } from "react";

/** "Ada Lovelace" -> "AL", "ada" -> "A". Up to two letters, upper case. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.[0]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}

// Complete literal class strings so Tailwind can see them.
const SIZE_CLASSES = {
  sm: "h-5 w-5 text-[10px] font-medium",
  md: "h-7 w-7 text-xs font-medium",
  lg: "h-24 w-24 font-display text-3xl",
  xl: "h-32 w-32 font-display text-4xl",
} as const;

/**
 * A small circle with a person's photo, or their initials when there is none (or the picture
 * fails to load). The full name is the accessible name and the hover title, so the picture or
 * the initials are never the only information.
 */
export function Avatar({
  name,
  label,
  src,
  size = "sm",
}: {
  name: string;
  label?: string;
  /** The photo's URL; initials are shown when it is missing or broken. */
  src?: string | null;
  /** sm = 20px (cards, lists); md = 28px (comment headers); lg = 96px; xl = 128px (profile). */
  size?: keyof typeof SIZE_CLASSES;
}) {
  // Remember WHICH url failed, so a new photo gets a fresh try without any reset code.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && src !== failedSrc;

  return (
    <span
      role="img"
      aria-label={label ?? name}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-border-default)] text-[var(--color-text-default)] ${SIZE_CLASSES[size]}`}
    >
      {showPhoto ? (
        <img
          src={src ?? undefined}
          alt=""
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
