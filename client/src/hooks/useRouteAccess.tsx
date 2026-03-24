import { Redirect } from "wouter";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/authStore";
import { canAccessAdminRoute, isAuthenticatedForRoute } from "@/lib/security/routeGuards";

type RouteAccessResult = {
  allowed: boolean;
  fallback: ReactNode | null;
};

export function useRequireAuth(): RouteAccessResult {
  const { isAuthenticated, isLoading } = useAuthStore();
  const authState = isAuthenticatedForRoute(isLoading, isAuthenticated);

  if (authState === "loading") {
    return { allowed: false, fallback: null };
  }
  if (authState === "denied") {
    return { allowed: false, fallback: <Redirect to={`/login?force=true&t=${Date.now()}`} /> };
  }
  return { allowed: true, fallback: null };
}

export function useRequireAdmin(): RouteAccessResult {
  const { userOrNull } = useAuthStore();
  if (!canAccessAdminRoute(userOrNull?.role)) {
    return { allowed: false, fallback: <Redirect to="/dashboard" /> };
  }
  return { allowed: true, fallback: null };
}
