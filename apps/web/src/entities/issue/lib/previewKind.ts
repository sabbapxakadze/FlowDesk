/**
 * Which attachments open in the preview popup (and get a thumbnail in comments).
 * Videos are limited to the two types the API accepts; PDF, text and CSV stay
 * plain links that open in a new tab.
 */
export function previewKind(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "video/mp4" || mimeType === "video/webm") return "video";
  return null;
}
