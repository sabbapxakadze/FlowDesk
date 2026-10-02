export type ByteRange =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" };

/**
 * Reads a `Range` request header against a file of `size` bytes. Browsers send one
 * to play and seek in a <video>: without range support a video can play from the
 * start but not jump ahead.
 *
 * Supports a single range: `bytes=a-b`, open-ended `bytes=a-`, and suffix
 * `bytes=-n` (the last n bytes). Per RFC 9110 a header we do not support (another
 * unit, several ranges, malformed numbers) is ignored and the whole file is sent,
 * which is always a valid answer. Only a well-formed range that starts beyond the
 * end of the file is "unsatisfiable" (416). `end` is inclusive and clamped to the file.
 */
export function parseRange(header: string | undefined, size: number): ByteRange {
  if (!header) return { kind: "none" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "none" };
  const [, startText = "", endText = ""] = match;
  if (startText === "" && endText === "") return { kind: "none" };

  if (startText === "") {
    const suffix = Number(endText);
    if (suffix === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "range", start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(startText);
  if (endText !== "" && Number(endText) < start) return { kind: "none" };
  if (start >= size) return { kind: "unsatisfiable" };
  const end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  return { kind: "range", start, end };
}
