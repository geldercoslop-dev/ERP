import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GRS_API_NETWORK_ERROR } from "@/lib/api/events";

export type ApiHealthStatus = "checking" | "online" | "offline";

type ApiHealthContextValue = {
  status: ApiHealthStatus;
  lastChecked: Date | null;
  /** Força nova verificação (ex.: após erro); mostra "checking" até concluir. */
  recheck: () => void;
};

const ApiHealthContext = createContext<ApiHealthContextValue | null>(null);

const POLL_MS = 25_000;

async function probeHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch("/api/health", { method: "GET", signal: ctrl.signal, credentials: "omit" });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export function ApiHealthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const mounted = useRef(true);

  const applyProbeResult = useCallback(async () => {
    const ok = await probeHealth();
    if (!mounted.current) return;
    setStatus(ok ? "online" : "offline");
    setLastChecked(new Date());
  }, []);

  /** Polling silencioso (não força "checking" a cada tick). */
  const runIntervalCheck = useCallback(() => {
    void applyProbeResult();
  }, [applyProbeResult]);

  /** Recheck explícito: UI em "checking" até terminar (forma esperada pelo app). */
  const recheck = useCallback(() => {
    setStatus("checking");
    void applyProbeResult();
  }, [applyProbeResult]);

  useEffect(() => {
    mounted.current = true;
    void applyProbeResult();
    const id = window.setInterval(runIntervalCheck, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [applyProbeResult, runIntervalCheck]);

  useEffect(() => {
    const onNetErr = () => {
      setStatus("offline");
      setLastChecked(new Date());
    };
    window.addEventListener(GRS_API_NETWORK_ERROR, onNetErr);
    return () => window.removeEventListener(GRS_API_NETWORK_ERROR, onNetErr);
  }, []);

  const value = useMemo<ApiHealthContextValue>(
    () => ({
      status,
      lastChecked,
      recheck,
    }),
    [status, lastChecked, recheck]
  );

  return <ApiHealthContext.Provider value={value}>{children}</ApiHealthContext.Provider>;
}

export function useApiHealth(): ApiHealthContextValue {
  const ctx = useContext(ApiHealthContext);
  if (!ctx) {
    throw new Error("useApiHealth deve ser usado dentro de ApiHealthProvider");
  }
  return ctx;
}

/** Versão segura para componentes fora do provider (não deve ocorrer no app principal). */
export function useApiHealthOptional(): ApiHealthContextValue | null {
  return useContext(ApiHealthContext);
}
