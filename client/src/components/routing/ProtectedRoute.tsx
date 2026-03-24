import type { ReactNode } from "react";
import { Redirect } from "wouter";
import AppShell from "@/components/layout/AppShell";
import LoadingScreen from "@/components/system/LoadingScreen";
import { useAuthStore } from "@/store/authStore";
import { isAuthenticatedForRoute } from "@/lib/security/routeGuards";

/**
 * Rota protegida: loading → shell autenticado ou redirect ao login.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const gate = isAuthenticatedForRoute(isLoading, isAuthenticated);

  if (gate === "loading") {
    return <LoadingScreen />;
  }
  if (gate === "denied") {
    return <Redirect to={`/login?force=true&t=${Date.now()}`} />;
  }

  return <AppShell>{children}</AppShell>;
}
