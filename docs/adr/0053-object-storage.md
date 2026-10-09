# 0053 - Files in an S3-compatible bucket (Neon Object Storage)

Status: Accepted - 2026-10-09. Phase 9 slice 9.5. Builds on ADR 0023 (range requests), ADR 0028 (photos), ADR 0049 (uploads switched off on the first deploy) and ADR 0045 (hosting plan, which named Cloudflare R2; see Alternatives).

## Context

Render's free disk is wiped at every restart, so the first deploy refused uploads (`STORAGE_DRIVER=disabled`). Files need a place that survives. The code already kept files behind four functions in `lib/storage.ts` (`saveFile`, `readFileStream`, `statFile`, `deleteFile`), which is the seam this slice uses.

## Decision

- **Two stores behind one interface** (`lib/storage-store.ts`): the disk (`storage-local.ts`, development and tests) and an S3-compatible bucket (`storage-s3.ts`, production). `lib/storage.ts` picks one **when a function is called**, from `STORAGE_DRIVER` (`local` | `s3` | `disabled`), so a test can switch it. Nothing outside `lib/storage.ts` knows which one is in use.
- **The bucket stays private and our own signed links stay.** The download route checks our HMAC link (ADR 0023's route is unchanged), reads the object from the bucket and streams it to the visitor. No bucket address ever reaches the browser. Cost: the file's bytes pass through the Render service, as they passed through its disk before.
- **Ranges and sizes:** `GetObject` with a `Range` header and `HeadObject` carry video seeking (ADR 0023) over unchanged.
- **One signature changed:** `readFileStream` is now async (an object store answers after a request). Its two callers handle a rejection as "not found" (a database row whose object is gone answers 404, not an empty file).
- **Config (`config/env.ts`):** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, all required when `STORAGE_DRIVER=s3` (the server refuses to start otherwise). Named `S3_*`, not `AWS_*`, so the SDK cannot pick up some other AWS setting by accident.
- **The SDK:** `@aws-sdk/client-s3`, the one Neon's documentation shows, with the two settings its documentation requires: `forcePathStyle: true` (path-style only, `/bucket/key`) and `requestChecksumCalculation: "WHEN_REQUIRED"`.
- **Live values (Render):** Neon Object Storage in Frankfurt (`eu-central-1`), bucket `flowdesk-files`, a credential with `storage:read` and `storage:write`. The key and secret live only in Render's environment.

## Tests

One set of checks runs against both stores (`file-stores.test.ts`): save and read back, a byte range, size, a missing file, delete (and deleting a missing one), overwrite. The s3 store is tested against a fake S3 server inside the test process (`lib/fake-s3.ts`: path-style PUT, GET with Range, HEAD, DELETE; it answers 403 to an unsigned request and 404 to a wrong bucket), so no network, account or Docker is needed. HTTP-level: with the s3 driver, an upload puts the bytes in the bucket and not on disk, a whole download and a `Range` download (206) return the right bytes, deleting the attachment removes the object, and an attachment whose object is gone answers 404. Config: each missing S3 value stops the server when the driver is `s3`. Mutation checks, each caught: ignoring the range, virtual-hosted addressing, a facade that always uses the disk. The virtual-hosted one was NOT caught at first: with an IP-address endpoint (127.0.0.1) the SDK keeps path-style by itself, so that test proved nothing; it now uses `localhost`, a name, and the mutation fails it.

## Not verified

- **A real round trip with Neon.** The fake proves our requests are well formed S3 calls, not that Neon accepts them. The first real check is an upload on the live site, then a redeploy, then a download.
- Neon Object Storage's status: one source called it a beta not yet recommended for production; the official page fetched did not say. Its free limits (one summary said 5 GB of storage and 5 GB of egress per project) were not found in the documentation and were not confirmed. Whether it needs a card: not stated.
- The bucket belongs to one Neon branch; what happens to it if that branch is deleted was not checked.

## Trade-offs, named

- File bytes go through our small server (512 MB, 0.1 CPU on the free plan). A large video streams chunk by chunk, but several people downloading at once would be slow. Presigned bucket links would avoid it and would cost the "private, our own link" simplicity; not needed at this size.
- Files already on someone's local disk are not moved (production never had any: uploads were off).
- Cloudflare R2 would work with the same store (change the endpoint and keys); it was not tried because Neon's storage is in the same account and region as the database.

## Alternatives rejected

- Cloudflare R2 first (ADR 0045's plan): whether it needs a card at sign-up was not verified; Neon's storage needs no new account.
- Presigned bucket links for downloads: faster, but a bucket address in the browser and a second expiry system next to ours.
- A lighter signing library instead of the AWS SDK: smaller, but more of the protocol to write and test ourselves.
