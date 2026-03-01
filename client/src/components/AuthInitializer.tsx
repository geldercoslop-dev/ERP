import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";

/**
 * Inicializador de autenticação.
 * - NÃO roda na rota /login (evita tela preta/loop).
 * - Chama checkAuth só UMA vez no mount (ref), evita loop de auth.me.
 * - Re-checa a cada 60s apenas quando NÃO autenticado (intervalo separado).
 */
export function AuthInitializer() {
  const { checkAuth, isAuthenticated } = useAuthStore();
  const hasCheckedOnceRef = useRef(false);

  // 1) Uma única checagem ao montar (quando não está no /login)
  useEffect(() => {
    const isLogin = window.location.pathname.startsWith("/login");
    if (isLogin) return;
    if (hasCheckedOnceRef.current) return;
    hasCheckedOnceRef.current = true;

    let cancelled = false;
    const checkOnce = async () => {
      if (cancelled) return;
      try {
        await checkAuth();
      } catch (e) {
        console.warn("[AuthInitializer] checkAuth falhou:", e);
      }
    };
    checkOnce();
    return () => { cancelled = true; };
  }, [checkAuth]);

  // 2) Intervalo de 60s só quando NÃO autenticado (não dispara no mount)
  useEffect(() => {
    const isLogin = window.location.pathname.startsWith("/login");
    if (isLogin || isAuthenticated) return;

    const interval = setInterval(() => {
      if (window.location.pathname.startsWith("/login")) return;
      checkAuth().catch((e) => console.warn("[AuthInitializer] re-check falhou:", e));
    }, 60_000);

    return () => clearInterval(interval);
  }, [isAuthenticated, checkAuth]);

  return null;
}
