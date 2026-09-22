import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requirePermission } from "./require-permission.js";
import { AppError } from "../shared/errors.js";

/**
 * No HTTP, no database — a plain unit test against the middleware
 * function with a hand-built req.ctx. This is the honest substitute for
 * an HTTP-level "a Viewer gets 403" test: there's no "invite a member
 * with a non-owner role" feature yet to naturally set that scenario up
 * over real HTTP (see the Slice 3 plan's scope note).
 */
function fakeReq(role: "owner" | "admin" | "member" | "viewer"): Request {
  return { ctx: { userId: "u1", organizationId: "o1", role } } as unknown as Request;
}

describe("requirePermission middleware", () => {
  it("calls next() when the role has the permission", () => {
    const next = vi.fn();
    requirePermission("manage_project")(fakeReq("owner"), {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it("throws a 403 AppError when the role lacks the permission", () => {
    const next = vi.fn();
    expect(() =>
      requirePermission("manage_project")(fakeReq("viewer"), {} as Response, next as NextFunction),
    ).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("throws a programmer error if req.ctx was never set", () => {
    const next = vi.fn();
    const req = {} as Request;
    expect(() =>
      requirePermission("view_project")(req, {} as Response, next as NextFunction),
    ).toThrow(/must run after requireOrgMembership/);
  });
});
