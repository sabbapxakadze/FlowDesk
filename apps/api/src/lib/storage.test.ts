import { existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "../config/env.js";
import { clearTestUploads } from "../db/test-utils.js";
import { deleteFile, readFileStream, saveFile, signDownloadToken, verifyDownloadToken } from "./storage.js";

/** Independent reimplementation of storage.ts's private sign() — proves
 * the module's own HMAC computation against a second, separately
 * written computation, not just "it returns something." */
function independentSign(attachmentId: string, expires: number): string {
  return createHmac("sha256", env.ATTACHMENT_SIGNING_SECRET).update(`${attachmentId}:${expires}`).digest("hex");
}

describe("lib/storage — file I/O", () => {
  beforeEach(async () => {
    await clearTestUploads();
  });

  it("round-trips a real file through saveFile and readFileStream", async () => {
    const storageKey = await saveFile("round-trip-id", Buffer.from("hello attachment"));

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = readFileStream(storageKey);
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });

    expect(Buffer.concat(chunks).toString()).toBe("hello attachment");
  });

  it("deleteFile actually removes the file from disk", async () => {
    const storageKey = await saveFile("delete-me", Buffer.from("bye"));
    const filePath = path.join(env.UPLOADS_DIR, storageKey);
    expect(existsSync(filePath)).toBe(true);

    await deleteFile(storageKey);

    expect(existsSync(filePath)).toBe(false);
  });

  it("deleteFile on a file that never existed does not throw", async () => {
    await expect(deleteFile("never-existed")).resolves.toBeUndefined();
  });
});

describe("lib/storage — signed download tokens", () => {
  it("accepts a token it just signed", () => {
    const { expires, signature } = signDownloadToken("attachment-1");
    expect(verifyDownloadToken("attachment-1", expires, signature)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const { expires, signature } = signDownloadToken("attachment-1");
    const lastChar = signature.at(-1);
    const tampered = signature.slice(0, -1) + (lastChar === "0" ? "1" : "0");

    expect(verifyDownloadToken("attachment-1", expires, tampered)).toBe(false);
  });

  it("rejects a signature minted for a different attachment id", () => {
    const { expires, signature } = signDownloadToken("attachment-1");

    expect(verifyDownloadToken("attachment-2", expires, signature)).toBe(false);
  });

  it("rejects an expired token even with a genuinely valid signature for that expiry", () => {
    const expiredExpires = Math.floor(Date.now() / 1000) - 10;
    const validSignatureForThatExpiry = independentSign("attachment-1", expiredExpires);

    expect(verifyDownloadToken("attachment-1", expiredExpires, validSignatureForThatExpiry)).toBe(false);
  });
});
