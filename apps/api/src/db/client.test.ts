import { describe, expect, it } from "vitest";
import { pool } from "./client.js";

describe("db/client - the connection pool (ADR 0049)", () => {
  it("survives an idle connection failing: the error is handled, not thrown", () => {
    // Why: a hosted database (Neon) closes idle connections when it suspends. The pool then emits "error"; with no listener Node turns that
    // into an uncaught exception and the whole server stops. emit() throws here exactly when no listener is attached.
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    expect(() => pool.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
  });

  it("is capped at DB_POOL_MAX connections", () => {
    // Why: a free hosted database allows only so many connections at once; an unbounded pool would exhaust them under load.
    expect(pool.options.max).toBe(10);
  });
});
