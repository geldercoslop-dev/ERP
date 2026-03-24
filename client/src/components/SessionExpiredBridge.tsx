import { useEffect } from "react";
import { GRS_AUTH_UNAUTHORIZED_EVENT } from "@/lib/security/apiClient";
import { invalidateSessionAfter401 } from "@/store/authStore";

/**
 * Escuta 401 global (fetch/tRPC) e limpa estado local antes de redirecionar ao login.
 */
export function SessionExpiredBridge() {
  useEffect(() => {
    const handler = () => {
      if (typeof window === "undefined") return;
      if (window.location.pathname.startsWith("/login")) return;
      invalidateSessionAfter401();
      window.location.href = `/login?session=expired&t=${Date.now()}`;
    };
    window.addEventListener(GRS_AUTH_UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(GRS_AUTH_UNAUTHORIZED_EVENT, handler);
  }, []);

  return null;
}
