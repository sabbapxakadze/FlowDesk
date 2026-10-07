export interface ShutdownStep {
  name: string;
  close: () => Promise<unknown> | unknown;
}

interface ShutdownOptions {
  /** Run one after another, in this order: stop taking requests first, close the database last. */
  steps: ShutdownStep[];
  /** If the steps have not finished by then, give up and exit with code 1. */
  timeoutMs: number;
  exit: (code: number) => void;
  log: { info: (message: string) => void; error: (details: object, message: string) => void };
}

/**
 * A clean stop (ADR 0046). Render sends SIGTERM when it replaces the server (a deploy) or lets it sleep: the server should finish what it
 * is doing, close its connections and its database pool, then exit, instead of being cut off mid-request. The returned function is safe
 * to call twice (a second signal while stopping does nothing), a failing step does not stop the others, and a step that hangs is cut off
 * by the timeout.
 */
export function createShutdown(options: ShutdownOptions) {
  let started = false;
  return async function shutdown(signal: string): Promise<void> {
    if (started) return;
    started = true;
    options.log.info(`${signal} received: shutting down`);

    const timer = setTimeout(() => {
      options.log.error({}, "shutdown took too long: forcing exit");
      options.exit(1);
    }, options.timeoutMs);
    timer.unref();

    let failed = false;
    for (const step of options.steps) {
      try {
        await step.close();
      } catch (err) {
        failed = true;
        options.log.error({ err }, `shutdown step "${step.name}" failed`);
      }
    }
    clearTimeout(timer);
    options.exit(failed ? 1 : 0);
  };
}
