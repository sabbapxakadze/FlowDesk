import { describe, expect, it } from "vitest";
import { projectInitials, sprintTimeLeft } from "./projectCard";

describe("projectInitials", () => {
  it("takes the first letters of the first two words, or the first two letters of one word", () => {
    // Why: the tile must tell projects apart; APP and API used to both read "AP" when it came from the key.
    expect(projectInitials("Website Redesign", "WEB")).toBe("WR");
    expect(projectInitials("Mobile App", "APP")).toBe("MA");
    expect(projectInitials("Platform API", "API")).toBe("PA");
    expect(projectInitials("Marketing", "MKT")).toBe("MA");
    expect(projectInitials("  design   system  tools ", "DS")).toBe("DS");
  });

  it("falls back to the key when the name has no letters or digits", () => {
    // Why: a name made of symbols must still give a tile something to show.
    expect(projectInitials("---", "WEB")).toBe("WE");
    expect(projectInitials("", "api")).toBe("AP");
  });
});

describe("sprintTimeLeft", () => {
  const today = "2026-10-11";

  it("counts days up to and including the end day, and says when it is over", () => {
    // Why: "ends today" is not "0 days left", and a sprint past its end must not read as time left.
    expect(sprintTimeLeft("2026-10-15", today)).toBe("4 days left");
    expect(sprintTimeLeft("2026-10-12", today)).toBe("1 day left");
    expect(sprintTimeLeft("2026-10-11", today)).toBe("ends today");
    expect(sprintTimeLeft("2026-10-10", today)).toBe("ended yesterday");
    expect(sprintTimeLeft("2026-10-04", today)).toBe("ended 7 days ago");
  });

  it("is null without an end date, and counts across a month end", () => {
    // Why: a sprint can be open-ended; and the day maths must be calendar days, not 30-day months.
    expect(sprintTimeLeft(null, today)).toBeNull();
    expect(sprintTimeLeft("2026-11-02", "2026-10-30")).toBe("3 days left");
  });
});
