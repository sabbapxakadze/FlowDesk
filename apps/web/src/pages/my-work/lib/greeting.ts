import { browserTimezone } from "../../../shared/lib/timezone";

/** The hour (0 to 23) it is for the person: in their chosen timezone (ADR 0031), else the browser's. */
export function hourIn(timezone: string | null, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone ?? browserTimezone(), hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0);
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Monday 12 October" written for the person's own day and the browser's language. */
export function longDateIn(timezone: string | null, now: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone ?? browserTimezone(), weekday: "long", day: "numeric", month: "long" }).format(now);
}
