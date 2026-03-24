import React from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  RefreshCw,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UseSystemHealthResult } from "@/hooks/useSystemHealth";

type HealthMonitorProps = {
  snapshot: UseSystemHealthResult;
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full shrink-0",
        ok ? "bg-emerald-500" : "bg-rose-500"
      )}
      aria-hidden
    />
  );
}

export function HealthMonitor({ snapshot }: HealthMonitorProps) {
  const {
    data,
    clientLatencyMs,
    fetchError,
    httpOk,
    initialized,
    isFetching,
    lastUpdated,
    backendReachable,
    refetch,
  } = snapshot;

  const backendOnline = backendReachable && httpOk;
  const backendDegraded = backendReachable && !httpOk;
  const redisOk = data?.redis.status === "ok";

  return (
    <div className="space-y-4">
      {fetchError ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2 items-start"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Comunicação com o backend</p>
            <p className="text-amber-800/90">{fetchError}</p>
            {data ? (
              <p className="text-xs mt-1 text-amber-700">
                Exibindo último snapshot válido abaixo.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Saúde da API</h3>
            <p className="text-xs text-slate-500">
              {lastUpdated
                ? `Atualizado às ${lastUpdated.toLocaleTimeString()}`
                : initialized
                  ? "Sem atualização"
                  : "Conectando…"}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={cn("h-4 w-4", isFetching && "animate-spin")}
          />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className={cn(!backendOnline && "border-rose-200")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-sm font-medium">Backend</CardTitle>
              </div>
              <StatusDot ok={backendOnline} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              {backendOnline ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-emerald-800">Online</span>
                </>
              ) : backendDegraded ? (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-amber-800">Degradado (HTTP não OK)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <span className="font-medium text-rose-800">Offline / indisponível</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {data?.server.uptimeFormatted
                ? `Uptime processo: ${data.server.uptimeFormatted}`
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(data && !redisOk && "border-amber-200")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-sm font-medium">Redis</CardTitle>
              </div>
              <StatusDot ok={Boolean(data && redisOk)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {!data ? (
              <p className="text-sm text-slate-500">Sem dados</p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={
                      redisOk
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }
                  >
                    {redisOk ? "Conectado" : "Falha / offline"}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    PING {data.redis.responseTime} ms
                  </span>
                </div>
                {data.redis.error ? (
                  <p className="text-xs text-rose-700">{data.redis.error}</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-sm font-medium">Tempo de resposta</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {clientLatencyMs != null ? `${clientLatencyMs}` : "—"}{" "}
              <span className="text-sm font-normal text-slate-500">ms (cliente)</span>
            </p>
            <p className="text-xs text-slate-500">
              Servidor (health):{" "}
              {data != null ? `${data.responseTime} ms` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {data ? (
        <p className="text-xs text-slate-400">
          DB: {data.database.status} · {data.database.responseTime} ms
          {data.database.error ? ` · ${data.database.error}` : ""}
        </p>
      ) : null}
    </div>
  );
}
