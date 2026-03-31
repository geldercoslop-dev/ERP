import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { fetchCSRFToken } from "../lib/security/csrfToken";

/**
 * Inicializador de autenticação.
 * - NÃO roda na rota /login (evita tela preta/loop).
 * - Chama checkAuth só UMA vez no mount (ref), evita loop de auth.me.
 * - Re-checa a cada 60s apenas quando NÃO autenticado (intervalo separado).
 * - Fetch CSRF token no mount (requerido por middleware de segurança).
 */
export function AuthInitializer() {
  const { checkAuth, isAuthenticated } = useAuthStore();
  const hasCheckedOnceRef = useRef(false);
  const hasFetchedCSRFRef = useRef(false);

  // 0) Fetch CSRF token ao montar (precisa ser feito uma única vez no app init)
  useEffect(() => {
    if (hasFetchedCSRFRef.current) return;
    hasFetchedCSRFRef.current = true;

    let cancelled = false;
    const fetchCSRF = async () => {
      if (cancelled) return;
      try {
        await fetchCSRFToken();
      } catch (e) {
        console.warn("[AuthInitializer] fetchCSRFToken failed:", e);
      }
    };
    fetchCSRF();
    return () => { cancelled = true; };
  }, []);

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
