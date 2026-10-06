import { AppError } from "../../shared/errors.js";

const TIMEOUT_MS = 10_000;

/** A provider call that failed (network, non-2xx, bad shape) is one clear error; the detail is for the log, not the person. */
export function exchangeFailed(detail: string): AppError {
  return new AppError("oauth_exchange_failed", 502, "Could not complete sign-in with the provider.", { detail: [detail] });
}

export async function providerFetch(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw exchangeFailed(`could not reach ${new URL(url).host}`);
  }
  if (!res.ok) throw exchangeFailed(`${new URL(url).host} answered ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw exchangeFailed(`${new URL(url).host} sent something that is not JSON`);
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
