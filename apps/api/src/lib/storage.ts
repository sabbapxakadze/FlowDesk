import { createHmac, timingSafeEqual } from "node:crypto";
import type { Readable } from "node:stream";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";
import { createLocalStore } from "./storage-local.js";
import { createS3Store } from "./storage-s3.js";
import type { FileStore } from "./storage-store.js";

/**
 * Refuses an upload when this deployment has no place to keep files (STORAGE_DRIVER=disabled, ADR 0049). Called at the START of an upload,
 * before any image processing or database work is done for nothing.
 */
export function assertUploadsEnabled(): void {
  if (env.STORAGE_DRIVER === "disabled") {
    throw new AppError("uploads_disabled", 503, "File uploads are switched off on this deployment.");
  }
}

/**
 * Files, behind four functions (ADR 0053): `saveFile`, `readFileStream`, `statFile`, `deleteFile`. Which store really holds them is
 * STORAGE_DRIVER: the disk (`local`, development and tests) or an S3-compatible bucket (`s3`, production on Render, whose own disk is wiped at
 * every restart). Nothing outside this file knows which. The driver is read when a function is CALLED, not when the file is loaded, so a test
 * can switch it. Download access is our own HMAC-signed, time-limited token (below), not a bucket link: the bucket stays private.
 *
 * Flat {attachmentId} keys, no extension: the mime type lives in the attachments table, not in the path.
 */
let s3Store: { key: string; store: FileStore } | undefined;

function currentStore(): FileStore {
  if (env.STORAGE_DRIVER !== "s3") return localStore;
  const config = {
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION!,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  }; // the `!`s are safe: the config check in env.ts refuses to start with the s3 driver and any of them missing
  const key = JSON.stringify(config);
  if (s3Store?.key !== key) s3Store = { key, store: createS3Store(config) }; // one client, rebuilt only if the settings change
  return s3Store.store;
}

const localStore = createLocalStore(() => env.UPLOADS_DIR);

export async function saveFile(attachmentId: string, buffer: Buffer): Promise<string> {
  assertUploadsEnabled();
  const storageKey = attachmentId;
  await currentStore().save(storageKey, buffer);
  return storageKey;
}

/** `range` is inclusive on both ends, like an HTTP byte range. Rejects when the file is missing. */
export function readFileStream(storageKey: string, range?: { start: number; end: number }): Promise<Readable> {
  return currentStore().read(storageKey, range);
}

/** The stored file's size in bytes; rejects if the file is missing. */
export function statFile(storageKey: string): Promise<number> {
  return currentStore().size(storageKey);
}

/** Best-effort: a failed delete shouldn't fail the API response (the DB row is already gone, which is what the user asked for), but it is
 * logged by the store rather than silently swallowed. */
export function deleteFile(storageKey: string): Promise<void> {
  return currentStore().remove(storageKey);
}

const DOWNLOAD_TOKEN_TTL_SECONDS = 5 * 60;

function sign(attachmentId: string, expires: number): string {
  return createHmac("sha256", env.ATTACHMENT_SIGNING_SECRET).update(`${attachmentId}:${expires}`).digest("hex");
}

/** { expires, signature } — the caller embeds both as query params on
 * the download URL. Minted fresh on every attachment-list fetch (see
 * issues.repository.ts's listAttachmentsForIssue), so a short TTL is
 * fine — there's no long-lived external-sharing use case here. */
export function signDownloadToken(attachmentId: string): { expires: number; signature: string } {
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;
  return { expires, signature: sign(attachmentId, expires) };
}

/**
 * Constant-time signature comparison — a naive === would leak timing
 * information about how many leading bytes matched, same reasoning
 * every real HMAC verification uses. Expiry is checked first since it's
 * cheap and doesn't need to be constant-time.
 */
export function verifyDownloadToken(attachmentId: string, expires: number, signature: string): boolean {
  if (!Number.isFinite(expires) || Math.floor(Date.now() / 1000) > expires) return false;

  const expected = Buffer.from(sign(attachmentId, expires), "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
