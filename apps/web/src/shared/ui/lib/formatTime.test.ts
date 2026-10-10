import { describe, expect, it } from "vitest";
import { formatTime } from "./formatTime";

// Newer ICU versions put a narrow no-break space before AM/PM; the checks compare with a plain space.
const norm = (text: string) => text.replace(/\u202f/g, " ");

// "now" is Saturday 10 October 2026, 12:00 UTC.
const NOW = Date.parse("2026-10-10T12:00:00Z");

describe("formatTime", () => {
  it("stays relative for the first day, in both directions", () => {
    // Why: "5 minutes ago" is the better wording while it is fresh, and a clock a little ahead of the server must not turn "just now" into a date.
    expect(norm(formatTime("2026-10-10T11:55:00Z", "Europe/Warsaw", NOW, "en-US"))).toBe("5 minutes ago");
    expect(norm(formatTime("2026-10-09T13:00:00Z", null, NOW, "en-US"))).toBe("23 hours ago");
    expect(norm(formatTime("2026-10-10T12:00:20Z", null, NOW, "en-US"))).toBe("just now");
  });

  it("becomes the actual date and time after a day, written in the chosen timezone", () => {
    // Why: this is "see your own time": the same instant reads differently in Warsaw (UTC+2 in October) and Los Angeles (UTC-7).
    const instant = "2026-10-05T15:42:00Z";
    expect(norm(formatTime(instant, "Europe/Warsaw", NOW, "en-US"))).toBe("Oct 5, 5:42 PM");
    expect(norm(formatTime(instant, "America/Los_Angeles", NOW, "en-US"))).toBe("Oct 5, 8:42 AM");
  });

  it("puts the date on the person's own day, which can differ from UTC's", () => {
    // Why: 23:30 UTC on the 4th is already the 5th in Warsaw and still the 4th in Los Angeles; a date taken in UTC would be wrong for one of them.
    const instant = "2026-10-04T23:30:00Z";
    expect(norm(formatTime(instant, "Europe/Warsaw", NOW, "en-US"))).toBe("Oct 5, 1:30 AM");
    expect(norm(formatTime(instant, "America/Los_Angeles", NOW, "en-US"))).toBe("Oct 4, 4:30 PM");
  });

  it("adds the year only when it is not the current year there", () => {
    // Why: "Oct 5" alone would be ambiguous a year later; but the year is noise for this year's dates. New Year's Eve in UTC is already next year in Kiritimati.
    expect(norm(formatTime("2025-10-05T15:42:00Z", "Europe/Warsaw", NOW, "en-US"))).toBe("Oct 5, 2025, 5:42 PM");
    const justAfterNewYear = Date.parse("2026-01-02T00:00:00Z");
    expect(norm(formatTime("2025-12-31T12:00:00Z", "Pacific/Kiritimati", justAfterNewYear + 3 * 24 * 60 * 60 * 1000, "en-US"))).toBe("Jan 1, 2:00 AM");
  });
});
