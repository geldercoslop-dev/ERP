/**
 * LeoHealthPanel - Componente de exibição do leo-system-monitor
 * 
 * Exibe dados do leo-system-monitor.ts (read-only):
 * - Status do servidor
 * - Status do banco
 * - Erros recentes
 * - Alertas ativos
 * - Memória e CPU
 * 
 * PRINCÍPIO: apenas exibição, sem lógica de monitoramento nova
 */

import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  HardDrive,
  Cpu,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";
import type { LeoSystemMonitorData } from "../hooks/useLeoObservability";

type LeoHealthPanelProps = {
  data: LeoSystemMonitorData | null;
  error: string | null;
  isFetching: boolean;
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

export function LeoHealthPanel({ data, error, isFetching }: LeoHealthPanelProps) {
  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardHeader>
          <CardTitle className="text-lg text-rose-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar dados do LEO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-rose-700">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Monitor do LEO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isFetching ? "Carregando..." : "Sem dados disponíveis"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const serverOnline = data.servidor.online;
  const dbConnected = data.banco.conectado;
  const memUsedMB = Math.round(data.servidor.memoria.heapUsed / 1024 / 1024);
  const memTotalMB = Math.round(data.servidor.memoria.heapTotal / 1024 / 1024);
  const memPercent = (data.servidor.memoria.heapUsed / data.servidor.memoria.heapTotal) * 100;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Monitor do LEO</h3>
            <p className="text-xs text-slate-500">
              Última verificação: {new Date(data.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Servidor */}
        <Card className={cn(!serverOnline && "border-rose-200")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-sm font-medium">Servidor</CardTitle>
              </div>
              <StatusDot ok={serverOnline} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              {serverOnline ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-emerald-800">Online</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span className="font-medium text-rose-800">Offline</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Uptime: {Math.floor(data.servidor.uptime / 60)}min
            </p>
          </CardContent>
        </Card>

        {/* Banco de Dados */}
        <Card className={cn(!dbConnected && "border-rose-200")}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-600" />
                <CardTitle className="text-sm font-medium">Banco</CardTitle>
              </div>
              <StatusDot ok={dbConnected} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              {dbConnected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-emerald-800">Conectado</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span className="font-medium text-rose-800">Desconectado</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Latência: {data.banco.tempoResposta.toFixed(0)}ms
            </p>
          </CardContent>
        </Card>

        {/* Memória */}
        <Card className={cn(memPercent > 80 && "border-amber-200", memPercent > 90 && "border-rose-200")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-sm font-medium">Memória</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-medium">
              {memUsedMB} / {memTotalMB} MB
            </p>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  memPercent > 90 ? "bg-rose-500" : memPercent > 80 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${memPercent}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">{memPercent.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas detalhadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* CPU */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-sm font-medium">CPU</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-medium">{data.servidor.cpu.uso.toFixed(1)}%</p>
            <p className="text-xs text-slate-500">
              Load: {data.servidor.cpu.loadAverage.slice(0, 2).join(", ")}
            </p>
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card className={cn(data.aplicacao.alertasAtivos > 0 && "border-amber-200")}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-600" />
              <CardTitle className="text-sm font-medium">Alertas Ativos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold tabular-nums">
              {data.aplicacao.alertasAtivos}
            </p>
            <p className="text-xs text-slate-500">
              Erros recentes: {data.aplicacao.errosRecentes}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Informações adicionais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Informações do Sistema LEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Última atividade:</span>
            <span className="font-medium">
              {new Date(data.aplicacao.ultimaAtividade).toLocaleString()}
            </span>
          </div>
          {data.banco.totalConexoes && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conexões DB:</span>
              <span className="font-medium">{data.banco.totalConexoes}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Disco usado:</span>
            <span className="font-medium">
              {((data.servidor.disco.usado / data.servidor.disco.total) * 100).toFixed(1)}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
