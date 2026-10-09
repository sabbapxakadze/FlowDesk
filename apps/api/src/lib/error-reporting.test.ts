import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { errorHandler } from "../middleware/error-handler.js";
import { requestLogger } from "../middleware/request-logger.js";
import { AppError } from "../shared/errors.js";
import { initErrorReporting, reportError, resetErrorReporting, flushErrorReporting } from "./error-reporting.js";

/**
 * Error tracking (ADR 0055). The SDK is given a fake transport, so nothing leaves the machine and the test can read exactly what WOULD be sent.
 * The point of most of these checks is what must NOT be sent: a tracker is only acceptable here if it cannot carry visitors' data out.
 */

interface Sent {
  exception?: { values?: { value?: string; type?: string }[] };
  tags?: Record<string, string>;
  request?: unknown;
  user?: unknown;
  breadcrumbs?: unknown;
  release?: string;
}

const sent: Sent[] = [];
const transport = () => ({
  send: async (envelope: unknown) => {
    // An envelope is [headers, [[itemHeaders, payload], ...]]; the error event is the payload of the "event" item.
    const items = (envelope as [unknown, [{ type: string }, Sent][]])[1];
    for (const [header, payload] of items) if (header.type === "event") sent.push(payload);
    return {};
  },
  flush: async () => true,
});

async function turnOn() {
  sent.length = 0;
  await initErrorReporting({ dsn: "https://publickey@o0.ingest.sentry.io/0", transport });
}

afterEach(async () => {
  await resetErrorReporting();
});

describe("error reporting is off by default", () => {
  it("does nothing, and does not throw, when no tracker is configured", async () => {
    // Why: most runs (development, tests, a deploy that never set SENTRY_DSN) must behave exactly as before, with no SDK loaded.
    await initErrorReporting({ dsn: undefined });
    expect(() => reportError(new Error("nobody listens"), { requestId: "r1" })).not.toThrow();
    await expect(flushErrorReporting(100)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});

describe("what an error report contains", () => {
  it("carries the error, the request id, the method and the route pattern", async () => {
    // Why: enough to find the failing request in our own log and to know which route broke, with no visitor data.
    await turnOn();
    reportError(new Error("the bucket said no"), { requestId: "req-123", method: "PUT", route: "/api/v1/users/me/avatar" });
    await flushErrorReporting(1000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.exception?.values?.[0]?.value).toBe("the bucket said no");
    expect(sent[0]?.tags).toMatchObject({ request_id: "req-123", method: "PUT", route: "/api/v1/users/me/avatar" });
  });

  it("replaces an email address inside the error text", async () => {
    // Why: a database error can quote a row ("Key (email)=(a@b.com) already exists"); that is a person's address going to a third party.
    await turnOn();
    reportError(new Error("duplicate key: Key (email)=(someone.private@example.com) already exists"), { requestId: "r2" });
    await flushErrorReporting(1000);
    const text = sent[0]?.exception?.values?.[0]?.value ?? "";
    expect(text).not.toContain("someone.private");
    expect(text).toContain("[email]");
  });

  it("sends no request data, no person and no breadcrumbs", async () => {
    // Why: cookies, authorization headers and bodies are exactly what a tracker must never receive (ADR 0050 keeps them out of logs too).
    await turnOn();
    reportError(new Error("boom"), { requestId: "r3" });
    await flushErrorReporting(1000);
    expect(sent[0]?.request).toBeUndefined();
    expect(sent[0]?.user).toBeUndefined();
    expect(sent[0]?.breadcrumbs).toBeUndefined();
  });
});

describe("the error handler reports only the unexpected", () => {
  function appThrowing(error: unknown) {
    const app = express();
    app.use(requestLogger); // the handler uses the per-request logger and id this puts on the request
    app.get("/boom/:id", () => {
      throw error;
    });
    app.use(errorHandler);
    return app;
  }

  it("an unexpected error is reported with the route pattern, not the real address, and the visitor still gets the generic 500", async () => {
    // Why: this is the wiring. The pattern keeps ids and query strings out of the report.
    await turnOn();
    const res = await request(appThrowing(new Error("unexpected"))).get("/boom/secret-id-42?token=abc");
    await flushErrorReporting(1000);
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Something went wrong on our end.");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tags?.route).toBe("/boom/:id");
    expect(JSON.stringify(sent[0])).not.toContain("secret-id-42");
    expect(JSON.stringify(sent[0])).not.toContain("token=abc");
  });

  it("an expected error (a 404, a 403, a validation failure) is not reported", async () => {
    // Why: those are normal answers, not bugs; reporting them would use up the free quota (5,000 a month, as read) and bury the real ones.
    await turnOn();
    const res = await request(appThrowing(new AppError("not_found", 404, "No such thing."))).get("/boom/1");
    await flushErrorReporting(1000);
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
  });
});
