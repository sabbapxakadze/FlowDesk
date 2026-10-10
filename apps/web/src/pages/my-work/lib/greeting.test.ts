import { describe, expect, it } from "vitest";
import { greetingFor, hourIn, longDateIn } from "./greeting";

describe("greetingFor", () => {
  it("changes at 5, 12 and 18, and calls the small hours evening", () => {
    // Why: the boundaries are where an off-by-one would greet someone wrongly.
    expect([4, 5, 11, 12, 17, 18, 23, 0].map(greetingFor)).toEqual([
      "Good evening",
      "Good morning",
      "Good morning",
      "Good afternoon",
      "Good afternoon",
      "Good evening",
      "Good evening",
      "Good evening",
    ]);
  });
});

describe("the person's own time", () => {
  // 2026-10-12T22:30:00Z is 00:30 on the 13th in Warsaw (UTC+2 in October) and 15:30 on the 12th in Los Angeles (UTC-7).
  const now = new Date("2026-10-12T22:30:00Z");

  it("reads the hour in the chosen timezone, not the server's or the browser's", () => {
    // Why: "Good morning" must follow the account timezone (ADR 0031), even when it differs from the computer's.
    expect(hourIn("Europe/Warsaw", now)).toBe(0);
    expect(hourIn("America/Los_Angeles", now)).toBe(15);
  });

  it("writes the date for the chosen timezone's day", () => {
    // Why: at 00:30 in Warsaw it is already Tuesday the 13th, while the same moment is still Monday the 12th in Los Angeles.
    expect(longDateIn("Europe/Warsaw", now)).toContain("13");
    expect(longDateIn("America/Los_Angeles", now)).toContain("12");
  });
});
