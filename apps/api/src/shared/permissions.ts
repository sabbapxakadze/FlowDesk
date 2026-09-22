/**
 * The role → permission map. Kept deliberately small: only what's actually
 * enforced by a real route today. The brief's fuller permission list
 * (create_issue, manage_members, ...) grows in later phases alongside the
 * features that need them — same "shape now, behavior later" pattern as
 * the organization_role enum itself (see Slice 1).
 */
export type Role = "owner" | "admin" | "member" | "viewer";

export type Permission = "view_project" | "manage_project";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(["view_project", "manage_project"]),
  admin: new Set(["view_project", "manage_project"]),
  member: new Set(["view_project"]),
  viewer: new Set(["view_project"]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
