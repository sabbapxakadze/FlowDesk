import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny S3 that runs inside the test process (ADR 0053): path-style `PUT`, `GET` (with `Range`), `HEAD` and `DELETE` on
 * `/<bucket>/<key>`, objects kept in a Map. It exists so the s3 file store can be tested without a network, an account or Docker.
 * It checks that a request is signed (an `Authorization: AWS4-HMAC-SHA256 ...` header) and addressed to the right bucket, and records every
 * request so a test can assert HOW the store talked to it, but it does not verify the signature itself. Test-only: nothing imports it
 * outside tests.
 */
export interface FakeS3 {
  endpoint: string;
  bucket: string;
  objects: Map<string, Buffer>;
  requests: { method: string; path: string; range: string | undefined; signed: boolean }[];
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const xmlError = (code: string, message: string) => `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;

export async function startFakeS3(bucket = "test-bucket"): Promise<FakeS3> {
  const objects = new Map<string, Buffer>();
  const requests: FakeS3["requests"] = [];

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://fake-s3");
      const [, requestBucket, ...rest] = url.pathname.split("/");
      const key = decodeURIComponent(rest.join("/"));
      const signed = (req.headers.authorization ?? "").startsWith("AWS4-HMAC-SHA256 ");
      const range = req.headers.range;
      requests.push({ method: req.method ?? "", path: url.pathname, range, signed });

      const fail = (status: number, code: string, message: string) => {
        res.writeHead(status, { "Content-Type": "application/xml" });
        res.end(req.method === "HEAD" ? undefined : xmlError(code, message));
      };
      if (!signed) return fail(403, "AccessDenied", "The request is not signed.");
      if (requestBucket !== bucket || !key) return fail(404, "NoSuchBucket", "No such bucket.");

      if (req.method === "PUT") {
        objects.set(key, await readBody(req));
        res.writeHead(200, { ETag: '"fake"' });
        return void res.end();
      }
      if (req.method === "DELETE") {
        objects.delete(key); // S3 answers 204 even for a key that is not there
        res.writeHead(204);
        return void res.end();
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const body = objects.get(key);
        if (!body) return fail(404, "NoSuchKey", "The specified key does not exist.");
        const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
        const headers = { "Content-Type": "application/octet-stream", "Accept-Ranges": "bytes" };
        if (match && req.method === "GET") {
          const start = Number(match[1]);
          const end = Math.min(Number(match[2]), body.length - 1);
          if (start > end) return fail(416, "InvalidRange", "The requested range is not satisfiable.");
          const part = body.subarray(start, end + 1);
          res.writeHead(206, { ...headers, "Content-Length": part.length, "Content-Range": `bytes ${start}-${end}/${body.length}` });
          return void res.end(part);
        }
        res.writeHead(200, { ...headers, "Content-Length": body.length });
        return void res.end(req.method === "HEAD" ? undefined : body);
      }
      return fail(405, "MethodNotAllowed", "Not supported by the fake.");
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    objects,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
