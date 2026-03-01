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
  const { user, isLoading, isAuthenticated, login, logout, checkAuth } = useAuthStore();

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

  return {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refresh: checkAuth,
  };
}
