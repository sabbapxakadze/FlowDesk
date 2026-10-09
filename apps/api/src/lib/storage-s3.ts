import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "./logger.js";
import type { FileStore } from "./storage-store.js";

export interface S3StoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Files in an S3-compatible bucket (Neon Object Storage; Cloudflare R2 would work the same way), ADR 0053. The bucket is private: nothing
 * is ever given a bucket address. The server checks our own signed link (lib/storage.ts), reads the object here and streams it to the visitor.
 * Two settings follow Neon's documentation: path-style addressing (`/bucket/key`, virtual-hosted style is not supported) and
 * `requestChecksumCalculation: "WHEN_REQUIRED"` (the SDK's newer default adds a checksum trailer that S3-compatible servers may not accept).
 */
export function createS3Store(config: S3StoreConfig): FileStore {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  return {
    async save(key, buffer) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentLength: buffer.length }));
    },
    async read(key, range) {
      const out = await client.send(
        new GetObjectCommand({ Bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
      );
      if (!out.Body) throw new Error(`the object store returned no body for ${key}`);
      return out.Body as Readable; // in Node the SDK's body is a Readable
    },
    async size(key) {
      const out = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
      if (typeof out.ContentLength !== "number") throw new Error(`the object store returned no size for ${key}`);
      return out.ContentLength;
    },
    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key })); // S3 answers success for a key that is not there
      } catch (err) {
        logger.warn({ err, storageKey: key }, "failed to delete attachment file from the bucket");
      }
    },
  };
}
