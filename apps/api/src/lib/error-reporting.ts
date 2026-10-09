import type { ErrorEvent } from "@sentry/node";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Error tracking (ADR 0055): unexpected server errors (the 500s, and a crash) are sent to Sentry, so one is not found only by someone reading
 * the log. Off unless SENTRY_DSN is set, and then the SDK is loaded only at that moment (it costs about 30 MB of memory, measured; the free
 * server has 512 MB). Only the server reports: the browser app does not, because that would need a change to the page's security policy.
 *
 * What is sent, on purpose: the error (its message and stack), the request id, the HTTP method and the route PATTERN, the commit that is running.
 * What is not: cookies, headers, the request body, the address of the visitor, the signed-in person, breadcrumbs, traces. An email address
 * inside an error message (a database error can quote one) is replaced before sending.
 */
type SentryModule = typeof import("@sentry/node");
/** The SDK's own type for its `transport` option, so a test can hand in a fake one. */
type TransportOption = NonNullable<Parameters<SentryModule["init"]>[0]>["transport"];
let sentry: SentryModule | undefined;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Removes everything but the error itself, and any email address from the texts (exported for the test). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.contexts?.culture;
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = value.value.replace(EMAIL, "[email]");
  }
  if (event.message) event.message = event.message.replace(EMAIL, "[email]");
  return event;
}

export async function initErrorReporting(options: { dsn?: string; transport?: TransportOption } = {}): Promise<void> {
  const dsn = options.dsn ?? env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    release: env.RENDER_GIT_COMMIT,
    // Nothing is added by itself except the two handlers for a crash: no request data, no instrumentation of other libraries.
    defaultIntegrations: false,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()],
    tracesSampleRate: 0,
    // Every kind of automatic data collection is switched off by name (this SDK version's replacement for `sendDefaultPii`). Nothing here
    // would be collected anyway with no integrations, so this is a second lock, and it holds if an integration is added later.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
    ...(options.transport ? { transport: options.transport } : {}),
  });
  sentry = Sentry;
  logger.info("error tracking is on");
}

/** Sends an unexpected error with a little context. Never throws: reporting must not make a failing request fail harder. */
export function reportError(err: unknown, context: { requestId?: string; method?: string; route?: string }): void {
  if (!sentry) return;
  try {
    const s = sentry;
    s.withScope((scope) => {
      if (context.requestId) scope.setTag("request_id", context.requestId);
      if (context.method) scope.setTag("method", context.method);
      if (context.route) scope.setTag("route", context.route);
      s.captureException(err);
    });
  } catch (reportingError) {
    logger.warn({ err: reportingError }, "could not report an error");
  }
}

/** Gives pending reports a moment to leave before the process stops. */
export async function flushErrorReporting(timeoutMs: number): Promise<void> {
  if (sentry) await sentry.flush(timeoutMs);
}

/** For tests: back to "off". */
export async function resetErrorReporting(): Promise<void> {
  if (sentry) await sentry.close(0);
  sentry = undefined;
}
