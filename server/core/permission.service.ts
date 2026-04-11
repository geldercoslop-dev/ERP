export type Role = "admin" | "user";
export type PermissionAction = "READ" | "WRITE" | "DELETE";

export type PermissionUser = {
  id?: number;
  role: Role;
};

const ROLE_PERMISSIONS: Record<Role, readonly PermissionAction[]> = {
  admin: ["READ", "WRITE", "DELETE"],
  user: ["READ", "WRITE"],
};

export function checkPermission(user: PermissionUser, action: PermissionAction): void {
  const allowedActions = ROLE_PERMISSIONS[user.role];

  if (!allowedActions.includes(action)) {
    throw new Error("FORBIDDEN");
  }
}
