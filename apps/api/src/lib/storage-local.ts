import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger.js";
import type { FileStore } from "./storage-store.js";

/**
 * Files on the local disk, one flat file per key (no extension: the type lives in the attachments table, not in the path). Used in
 * development and in the tests. On Render's free plan the disk is wiped at every restart, which is why production uses the s3 store.
 * `dir` is a function so a test (or a changed UPLOADS_DIR) is read at the moment of use.
 */
export function createLocalStore(dir: () => string): FileStore {
  return {
    async save(key, buffer) {
      await mkdir(dir(), { recursive: true });
      await writeFile(path.join(dir(), key), buffer);
    },
    async read(key, range) {
      const file = path.join(dir(), key);
      await stat(file); // rejects now, like the s3 store, instead of failing later as a stream error
      return createReadStream(file, range);
    },
    async size(key) {
      return (await stat(path.join(dir(), key))).size;
    },
    async remove(key) {
      try {
        await unlink(path.join(dir(), key));
      } catch (err) {
        logger.warn({ err, storageKey: key }, "failed to delete attachment file from disk");
      }
    },
  };
}
