import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "./Button";
import { buttonVariants } from "./buttonVariants";
import { IconButton } from "./IconButton";

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const STEP = 1.25;

/**
 * A modal preview of one image or video. An image is shown fitted to the window,
 * with zoom (buttons, or + / - / 0 on the keyboard); a video gets the browser's own
 * player controls (play, seek, volume, full screen) and no zoom. Both have a
 * Download link and Close. A native <dialog> opened with showModal(), the same
 * choice the search popup made (ADR: no dialog library for a handful of modals).
 * That gives, for free: Esc closes it, focus is kept inside, the page behind is
 * inert, and focus returns to whatever opened it. Clicking the dimmed area also
 * closes it.
 *
 * Domain-free on purpose (it only knows a kind, a URL, a name and a size label): the
 * caller decides what is previewable and where the URL comes from. Mount it only
 * while open; it opens itself on mount and tells the caller when it closes. Closing
 * unmounts the <video>, which stops playback.
 *
 * `scale` (images only) is null while the image is "fitted" (the default); otherwise
 * it is a multiple of the image's natural size.
 */
export function MediaPreviewDialog({
  kind,
  src,
  filename,
  sizeLabel,
  onClose,
  onLoadError,
}: {
  kind: "image" | "video";
  src: string;
  filename: string;
  sizeLabel: string;
  onClose: () => void;
  /** The file failed to load (for example its signed link expired). */
  onLoadError?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);
  // How big the image is drawn while fitted, as a multiple of its natural size.
  const [fitScale, setFitScale] = useState(1);

  // Measured (not guessed) so the percentage is true and zoom starts from what the
  // person sees; re-measured when the window is resized. Only while fitted.
  useEffect(() => {
    const image = imageRef.current;
    if (!image || scale !== null) return;
    const measure = () => {
      if (image.naturalWidth) setFitScale(image.clientWidth / image.naturalWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    return () => observer.disconnect();
  }, [scale, naturalWidth]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Guarded, and no dialog.close() in the cleanup, because React runs effects twice
    // in development: a close() from the first cleanup queues a "close" event that
    // would fire AFTER the listener is re-attached, and the popup would report itself
    // closed the instant it opened. Unmounting removes the element, which is enough.
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
    // onClose is the caller's setter; a new function each render must not reopen the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomBy(factor: number) {
    if (!naturalWidth) return;
    // From "fit", start from the scale the image is currently drawn at.
    const current = scale ?? fitScale;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor)));
  }

  const shownPercent = Math.round((scale ?? fitScale) * 100);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Preview of ${filename}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close();
      }}
      onKeyDown={(e) => {
        if (kind !== "image") return;
        if (e.key === "+" || e.key === "=") zoomBy(STEP);
        else if (e.key === "-") zoomBy(1 / STEP);
        else if (e.key === "0") setScale(null);
      }}
      className="m-auto flex max-h-[92vh] w-[min(94vw,1100px)] flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-0 text-[var(--color-text-default)] shadow-lg motion-dialog [--dialog-backdrop:rgb(0_0_0/0.6)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] px-4 py-2">
        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold">{filename}</span>
          <span className="ml-2 text-xs text-[var(--color-text-muted)]">{sizeLabel}</span>
        </p>
        <IconButton label="Close preview" onClick={() => dialogRef.current?.close()}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="flex min-h-40 flex-1 overflow-auto bg-[var(--color-bg-page)] p-3">
        {kind === "image" ? (
          <img
            ref={imageRef}
            src={src}
            alt={filename}
            onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
            onError={onLoadError}
            draggable={false}
            className="m-auto block"
            style={
              scale === null
                ? { maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }
                : { width: naturalWidth * scale, maxWidth: "none", height: "auto" }
            }
          />
        ) : (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={filename}
            onError={onLoadError}
            className="m-auto block max-h-[70vh] max-w-full"
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-default)] px-4 py-2">
        {kind === "image" && (
          <>
            <Button type="button" size="sm" variant="secondary" aria-label="Zoom out" onClick={() => zoomBy(1 / STEP)}>
              <Minus size={14} aria-hidden="true" />
            </Button>
            <span aria-live="polite" className="min-w-12 text-center text-xs text-[var(--color-text-muted)]">
              {shownPercent}%
            </span>
            <Button type="button" size="sm" variant="secondary" aria-label="Zoom in" onClick={() => zoomBy(STEP)}>
              <Plus size={14} aria-hidden="true" />
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setScale(null)}>
              Fit
            </Button>
          </>
        )}
        <a href={src} download={filename} className={`${buttonVariants({ variant: "primary", size: "sm" })} ml-auto`}>
          Download
        </a>
        <Button type="button" size="sm" variant="secondary" onClick={() => dialogRef.current?.close()}>
          Close
        </Button>
      </div>
    </dialog>
  );
}
