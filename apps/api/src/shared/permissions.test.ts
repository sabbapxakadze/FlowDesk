import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions.js";

describe("hasPermission", () => {
  it("lets every role view a project", () => {
    expect(hasPermission("owner", "view_project")).toBe(true);
    expect(hasPermission("admin", "view_project")).toBe(true);
    expect(hasPermission("member", "view_project")).toBe(true);
    expect(hasPermission("viewer", "view_project")).toBe(true);
  });

  it("only lets owner and admin manage a project", () => {
    expect(hasPermission("owner", "manage_project")).toBe(true);
    expect(hasPermission("admin", "manage_project")).toBe(true);
    expect(hasPermission("member", "manage_project")).toBe(false);
    expect(hasPermission("viewer", "manage_project")).toBe(false);
  });
});
