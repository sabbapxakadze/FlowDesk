# 0023 — Video attachments, range requests and comment thumbnails

Status: Accepted — 2026-10-02.

## Context

Attachments allowed images, PDF, text and CSV (10 MB cap). The owner wanted videos
attached to comments, a small thumbnail of images and videos inside the comment, and a
preview popup that plays a video. Three facts shaped it:

- A browser plays a `<video>` from the start without any help, but **seeking** (jumping
  ahead) works only if the server answers HTTP `Range` requests with `206 Partial
  Content`. The download route streamed the whole file every time.
- Download links are signed and live 5 minutes (ADR for slice 4 of Phase 7). A thumbnail
  that stays on screen can outlive its link.
- The server trusts the client-sent MIME type (no byte sniffing), as before.

## Decision

- **Allowed types:** `video/mp4` and `video/webm` are added to the shared list in
  `packages/contracts`. Both play in every current browser without a plugin. Other video
  types (for example `video/quicktime`) are refused by the form and by the API. **The cap
  stays 10 MB** for every type: that is a short clip, not a screen recording, and it keeps
  the memory-storage upload (multer) safe.
- **Range requests on the download route:** one range per request: `bytes=a-b`, open
  ended `bytes=a-`, and suffix `bytes=-n`. Answer `206` with `Content-Range`,
  `Content-Length` and `Accept-Ranges: bytes`. A well-formed range that starts past the end
  gets `416` with `Content-Range: bytes */size`. Anything else (no header, another unit,
  several ranges, malformed numbers) is ignored and the whole file is sent with `200`,
  which RFC 9110 allows. The parsing is a pure function (`lib/http-range.ts`) so each case
  is unit tested. The signature check runs before any of this, so a `Range` header cannot
  bypass it. A stored file that went missing answers `404`, not a crashed stream.
- **`X-Content-Type-Options: nosniff`** on downloads: the type is client-supplied, so the
  browser must not guess a different one.
- **Thumbnails are the original, scaled by the browser** (`object-cover` in a 96 px
  tile). No generated thumbnail files, no image-processing dependency. A video tile
  loads only its metadata and first frame (`preload="metadata"`, `#t=0.1`) and shows a
  play badge. Documents (PDF, text, CSV) stay text chips that open in a new tab.
- **The popup** (`MediaPreviewDialog`, was `ImagePreviewDialog`) takes a `kind`. A video
  gets the browser's own controls, autoplay on open, no zoom; closing unmounts it, which
  stops playback.
- **Expired links:** thumbnail and popup share one hook (`useAttachmentPreview`): on a
  load error the attachment list is refetched once and the file is requested again.
  Opening the popup allows one more refresh.

## Consequences

- Seeking in a video works; the same route serves images and documents unchanged (a
  full `200` now also carries `Content-Length`).
- A comment with many large images downloads each full file to draw a 96 px tile.
  Acceptable at a 10 MB cap and lazy loading; real thumbnails are the fix if it hurts.
- Still true: the MIME type is not verified against the bytes, so a mislabelled file is
  stored as labelled (the browser, with `nosniff`, will refuse to play it).
- Video thumbnails depend on the browser decoding the first frame; a browser that cannot
  shows an empty tile with the play badge, and the popup still offers Download.

## Alternatives rejected

- **Generate thumbnails on upload** (sharp, ffmpeg): a native dependency and a second
  stored file per attachment for a feature the cap already makes cheap.
- **More video types or a higher cap:** mov, avi, mkv do not play everywhere; a bigger
  cap needs streaming uploads to disk, which is a different slice.
- **Always send the whole file:** simplest, but seeking would silently not work.
- **Support multiple ranges (`multipart/byteranges`):** browsers do not ask for them
  when playing video; ignoring them is valid and much simpler.
