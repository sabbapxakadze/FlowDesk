import { describe, expect, it } from "vitest";
import { parsePersonRef, personPath, personShortId, slugify } from "./paths";

const ID = "b50fc811-30df-40e2-baec-ba98459c5e09";

describe("slugify", () => {
  it("lower-cases, drops accents and joins words with single dashes", () => {
    // Why: the name part of an address must be tidy ASCII that reads well and never has doubled or edge dashes.
    expect(slugify("Daniel Okafor")).toBe("daniel-okafor");
    expect(slugify("  Sofía   Rossi-López ")).toBe("sofia-rossi-lopez");
    expect(slugify("E2E User")).toBe("e2e-user");
  });

  it("falls back to 'person' when nothing usable is left, and stays short", () => {
    // Why: a name in another alphabet (Georgian, for one) has no A to Z letters; the address must still be well formed, and a very long name must not make a very long address.
    expect(slugify("საბა")).toBe("person");
    expect(slugify("!!!")).toBe("person");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("personPath and parsePersonRef", () => {
  it("builds name plus the first 8 characters of the id, and reads it back", () => {
    // Why: the address is how a person is found, so building and parsing must agree.
    expect(personShortId(ID)).toBe("b50fc811");
    expect(personPath("Daniel Okafor", ID)).toBe("/people/daniel-okafor-b50fc811");
    expect(parsePersonRef("daniel-okafor-b50fc811")).toEqual({ kind: "short", short: "b50fc811" });
  });

  it("finds a person by the id part alone, so a changed name or a wrong name still resolves", () => {
    // Why: names change; an old link with the old name must still find the person (the page then rewrites it).
    expect(parsePersonRef("old-name-b50fc811")).toEqual({ kind: "short", short: "b50fc811" });
    expect(parsePersonRef("person-B50FC811")).toEqual({ kind: "short", short: "b50fc811" });
    expect(parsePersonRef("b50fc811")).toEqual({ kind: "short", short: "b50fc811" });
  });

  it("still understands an old full-id address, and refuses anything else", () => {
    // Why: links made before this change carry the whole id; and nonsense must be 'not found', not a lookup.
    expect(parsePersonRef(ID)).toEqual({ kind: "uuid", id: ID });
    expect(parsePersonRef("daniel-okafor")).toEqual({ kind: "invalid" });
    expect(parsePersonRef("daniel-okafor-b50fc81")).toEqual({ kind: "invalid" }); // 7 characters
    expect(parsePersonRef("")).toEqual({ kind: "invalid" });
  });
});
