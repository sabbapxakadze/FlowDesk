import type { Readable } from "node:stream";

/**
 * Where files really live (ADR 0053). Two implementations: the disk (storage-local.ts) and an S3-compatible bucket (storage-s3.ts). The
 * app talks to lib/storage.ts, which picks one by STORAGE_DRIVER; nothing else knows which.
 */
export interface FileStore {
  /** Keeps `buffer` under `key` (a second save of the same key replaces it). */
  save(key: string, buffer: Buffer): Promise<void>;
  /** The file, or only the bytes `start` to `end` (inclusive, like an HTTP byte range). Rejects when there is no such file. */
  read(key: string, range?: { start: number; end: number }): Promise<Readable>;
  /** The size in bytes. Rejects when there is no such file. */
  size(key: string): Promise<number>;
  /** Best effort: a missing file or a failed delete is logged, not thrown (the database row is already gone, which is what the person asked for). */
  remove(key: string): Promise<void>;
}
