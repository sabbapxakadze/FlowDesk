import { describe, expect, it } from "vitest";
import { parseRange } from "./http-range.js";

// Why: the parser decides which bytes a browser gets when it seeks in a video, so
// each branch is pinned with an exact expected answer (file size 1000 throughout).
describe("lib/http-range — parseRange", () => {
  const size = 1000;

  it("reads a closed range, inclusive of both ends", () => {
    expect(parseRange("bytes=0-99", size)).toEqual({ kind: "range", start: 0, end: 99 });
    expect(parseRange("bytes=500-500", size)).toEqual({ kind: "range", start: 500, end: 500 });
  });

  it("reads an open-ended range to the last byte", () => {
    expect(parseRange("bytes=900-", size)).toEqual({ kind: "range", start: 900, end: 999 });
  });

  it("reads a suffix range as the last n bytes, never before byte 0", () => {
    expect(parseRange("bytes=-100", size)).toEqual({ kind: "range", start: 900, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ kind: "range", start: 0, end: 999 });
  });

  it("clamps an end beyond the file to the last byte", () => {
    expect(parseRange("bytes=990-5000", size)).toEqual({ kind: "range", start: 990, end: 999 });
  });

  it("is unsatisfiable when the start is at or past the end, or the suffix is zero", () => {
    expect(parseRange("bytes=1000-", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=2000-3000", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=0-0", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignores headers it does not support, so the whole file is sent", () => {
    for (const header of [undefined, "", "items=0-5", "bytes=0-5,10-15", "bytes=abc-", "bytes=-", "bytes=50-10", "bytes=1.5-3"]) {
      expect(parseRange(header, size), String(header)).toEqual({ kind: "none" });
    }
  });
});
