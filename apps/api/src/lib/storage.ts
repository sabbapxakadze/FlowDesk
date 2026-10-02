import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Local disk storage + our own signed download tokens — not real S3.
 * Confirmed with the owner: CLAUDE.md's stack list puts "S3-compatible
 * object storage" and Docker under Later (Phase 9), so this teaches the
 * real signed-URL *concept* (tamper-proof, time-boxed access, no cookie/
 * JWT needed) without pulling that infra forward. Real S3 would swap in
 * behind this same saveFile/deleteFile/sign/verify interface later.
 * See the Phase 7 slice 4 plan.
 *
 * Flat {attachmentId} filenames on disk — no extension needed, since
 * mimeType lives in the attachments table, not inferred from the path.
 */
export async function saveFile(attachmentId: string, buffer: Buffer): Promise<string> {
  await mkdir(env.UPLOADS_DIR, { recursive: true });
  const storageKey = attachmentId;
  await writeFile(path.join(env.UPLOADS_DIR, storageKey), buffer);
  return storageKey;
}

/** `range` is inclusive on both ends, like an HTTP byte range. */
export function readFileStream(storageKey: string, range?: { start: number; end: number }) {
  return createReadStream(path.join(env.UPLOADS_DIR, storageKey), range);
}

/** The stored file's size in bytes; rejects if the file is missing. */
export async function statFile(storageKey: string): Promise<number> {
  return (await stat(path.join(env.UPLOADS_DIR, storageKey))).size;
}

/** Best-effort — a failed delete here shouldn't fail the API response
 * (the DB row is already gone, which is what the user actually asked
 * for), but it's a real problem worth knowing about, so it's logged via
 * pino rather than silently swallowed. */
export async function deleteFile(storageKey: string): Promise<void> {
  try {
    await unlink(path.join(env.UPLOADS_DIR, storageKey));
  } catch (err) {
    logger.warn({ err, storageKey }, "failed to delete attachment file from disk");
  }
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
