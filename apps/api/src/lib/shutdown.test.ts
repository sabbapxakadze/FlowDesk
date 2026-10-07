import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "./shutdown.js";

/** The clean stop (ADR 0046), with fake steps and a fake exit, so nothing real is closed. */

function setup(steps: { name: string; close: () => unknown }[], timeoutMs = 1000) {
  const exit = vi.fn();
  const log = { info: vi.fn(), error: vi.fn() };
  const shutdown = createShutdown({ steps, timeoutMs, exit, log });
  return { shutdown, exit, log };
}

describe("shutdown", () => {
  it("closes the steps in order (requests first, the database last) and exits 0", async () => {
    // Why: closing the database before the server stops taking requests would break the requests still being answered.
    const order: string[] = [];
    const { shutdown, exit } = setup([
      { name: "server", close: async () => void order.push("server") },
      { name: "pool", close: async () => void order.push("pool") },
    ]);
    await shutdown("SIGTERM");
    expect(order).toEqual(["server", "pool"]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("a second signal while stopping does nothing", async () => {
    // Why: Render or an impatient Ctrl+C can signal twice; the steps must not run twice.
    const close = vi.fn();
    const { shutdown, exit } = setup([{ name: "server", close }]);
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("a failing step is logged and the next steps still run, then it exits 1", async () => {
    // Why: if the server cannot close cleanly the database pool should still be closed.
    const second = vi.fn();
    const { shutdown, exit, log } = setup([
      { name: "server", close: () => Promise.reject(new Error("boom")) },
      { name: "pool", close: second },
    ]);
    await shutdown("SIGTERM");
    expect(second).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.anything(), 'shutdown step "server" failed');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("gives up with exit 1 when a step hangs past the timeout", async () => {
    // Why: a connection that never closes must not keep the old server alive for ever after a deploy.
    vi.useFakeTimers();
    const { shutdown, exit } = setup([{ name: "server", close: () => new Promise(() => undefined) }], 500);
    void shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(600);
    expect(exit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});
