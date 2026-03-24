export function isAuthenticatedForRoute(
  isLoading: boolean,
  isAuthenticated: boolean
): "loading" | "allowed" | "denied" {
  if (isLoading) return "loading";
  if (!isAuthenticated) return "denied";
  return "allowed";
}

export function canAccessAdminRoute(role: string | undefined): boolean {
  return String(role ?? "").toLowerCase() === "admin";
}

export function canAccessVendedorRoute(role: string | undefined): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "admin" || r === "vendedor";
}

export function requireAuth(isLoading: boolean, isAuthenticated: boolean): boolean {
  return isAuthenticatedForRoute(isLoading, isAuthenticated) === "allowed";
}

export function requireAdmin(role: string | undefined): boolean {
  return canAccessAdminRoute(role);
}
