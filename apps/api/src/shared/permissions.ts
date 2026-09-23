/**
 * The role → permission map. Kept deliberately small: only what's actually
 * enforced by a real route today. The brief's fuller permission list
 * (create_issue, manage_members, ...) grows in later phases alongside the
 * features that need them — same "shape now, behavior later" pattern as
 * the organization_role enum itself (see Slice 1).
 */
export type Role = "owner" | "admin" | "member" | "viewer";

export type Permission = "view_project" | "manage_project" | "view_issue" | "manage_issue";

// manage_issue is deliberately broader than manage_project: creating a
// project is an admin-level action, but filing/editing issues is the
// normal day-to-day action every member takes. Collapsing the two onto
// one permission would block regular members from using the tracker at
// all — see the Phase 3 slice 1 plan's "Decisions" section.
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(["view_project", "manage_project", "view_issue", "manage_issue"]),
  admin: new Set(["view_project", "manage_project", "view_issue", "manage_issue"]),
  member: new Set(["view_project", "view_issue", "manage_issue"]),
  viewer: new Set(["view_project", "view_issue"]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
