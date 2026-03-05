import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/store/authStore";

interface UseAuthOptions {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
}

/**
 * Hook para gerenciar autenticação (Zustand).
 * - NÃO chama checkAuth (só AuthInitializer chama; evita loop de auth.me).
 * - Só redireciona quando status está resolvido (success/error), nunca durante loading.
 */
export function useAuth(options?: UseAuthOptions) {
  const [, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated, login, logout, checkAuth, isImpersonating, vendedorNome, vendedorId, voltarAoAdmin } = useAuthStore();

  const { redirectOnUnauthenticated = false, redirectPath = "/login?force=true" } = options ?? {};

  useEffect(() => {
    const isLogin = window.location.pathname.startsWith("/login");
    if (isLogin) return;
    if (!redirectOnUnauthenticated) return;
    // Não redirecionar durante loading (esperar AuthInitializer terminar)
    if (isLoading) return;
    if (isAuthenticated) return;
    setLocation(redirectPath);
  }, [redirectOnUnauthenticated, redirectPath, isLoading, isAuthenticated, setLocation]);

  const isAdmin = user?.role === "admin";
  const isVendedor = user?.role === "vendedor";
  /** View de estoque/regras: admin não impersonando = admin; caso contrário = vendedor. Evita lógica negativa (!isAdmin). */
  const effectiveRoleView = isAdmin && !(isImpersonating ?? false) ? "admin" as const : "vendedor" as const;

  return {
    user,
    isLoading,
    isAuthenticated,
    isImpersonating: isImpersonating ?? false,
    vendedorNome: vendedorNome ?? undefined,
    vendedorId: vendedorId ?? undefined,
    isAdmin,
    isVendedor,
    effectiveRoleView,
    login,
    logout,
    refresh: checkAuth,
    voltarAoAdmin,
  };
}
