import { useCallback, useEffect, useRef, useState } from "react";
import { sameOriginFetch } from "../lib/security/apiClient";
import {
  parseSystemHealthPayload,
  type SystemHealthPayload,
} from "../types/system-health";

const HEALTH_URL = "/api/system/health";

export type UseSystemHealthResult = SystemHealthState & {
  refetch: () => Promise<void>;
};

export type SystemHealthState = {
  data: SystemHealthPayload | null;
  /** Tempo total do fetch até JSON parseado (latência percebida no cliente) */
  clientLatencyMs: number | null;
  fetchError: string | null;
  httpOk: boolean;
  /** True após primeira tentativa (sucesso ou falha) */
  initialized: boolean;
  isFetching: boolean;
  lastUpdated: Date | null;
  /** Backend respondeu com JSON válido de health */
  backendReachable: boolean;
};

const initialState: SystemHealthState = {
  data: null,
  clientLatencyMs: null,
  fetchError: null,
  httpOk: false,
  initialized: false,
  isFetching: false,
  lastUpdated: null,
  backendReachable: false,
};

export function useSystemHealth(pollIntervalMs = 5000): UseSystemHealthResult {
  const [state, setState] = useState<SystemHealthState>(initialState);
  const mounted = useRef(true);

  const fetchHealth = useCallback(async () => {
    setState((s) => ({ ...s, isFetching: true }));
    const started = performance.now();
    try {
      const response = await sameOriginFetch(HEALTH_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        if (!mounted.current) return;
        setState((prev) => ({
          ...prev,
          data: prev.data,
          clientLatencyMs: Math.round(performance.now() - started),
          fetchError: "Resposta não é JSON válido",
          httpOk: response.ok,
          initialized: true,
          isFetching: false,
          lastUpdated: new Date(),
          backendReachable: false,
        }));
        return;
      }

      const payload = parseSystemHealthPayload(parsed);
      const clientLatencyMs = Math.round(performance.now() - started);

      if (!mounted.current) return;

      if (!payload) {
        setState((prev) => ({
          ...prev,
          data: prev.data,
          clientLatencyMs,
          fetchError: "Formato de health inválido",
          httpOk: response.ok,
          initialized: true,
          isFetching: false,
          lastUpdated: new Date(),
          backendReachable: false,
        }));
        return;
      }

      setState({
        data: payload,
        clientLatencyMs,
        fetchError: null,
        httpOk: response.ok,
        initialized: true,
        isFetching: false,
        lastUpdated: new Date(),
        backendReachable: true,
      });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Falha de rede ao consultar saúde do sistema";
      if (!mounted.current) return;
      setState((prev) => ({
        ...prev,
        clientLatencyMs: Math.round(performance.now() - started),
        fetchError: message,
        httpOk: false,
        initialized: true,
        isFetching: false,
        lastUpdated: new Date(),
        backendReachable: false,
      }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchHealth();
    const id = window.setInterval(() => {
      void fetchHealth();
    }, pollIntervalMs);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [fetchHealth, pollIntervalMs]);

  return { ...state, refetch: fetchHealth };
}
