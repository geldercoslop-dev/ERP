/**
 * LeoObservabilityDashboard - Dashboard de Observabilidade do LEO
 * 
 * Agrega dados de múltiplas fontes existentes:
 * - SystemHealth (health check geral do sistema)
 * - LeoSystemMonitor (monitoramento específico do LEO)
 * - ExecutionRegistry (fluxo de execução)
 * 
 * PRINCÍPIO: apenas orquestração e exibição, sem duplicação de backend
 */

import React from "react";
import { Activity, Brain, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { cn } from "../../lib/utils";
import { useLeoObservability } from "./hooks/useLeoObservability";
import { LeoHealthPanel } from "./components/LeoHealthPanel";
import { ExecutionFlowPanel } from "./components/ExecutionFlowPanel";

export function LeoObservabilityDashboard() {
  const {
    systemHealth,
    leoSystemMonitor,
    executionRecords,
    executionRecordsTotal,
    leoSystemMonitorError,
    executionRecordsError,
    isFetchingLeo,
  } = useLeoObservability(10000);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Observabilidade do LEO</h2>
            <p className="text-sm text-slate-500">
              Monitoramento em tempo real do operador autônomo
            </p>
          </div>
        </div>
        {isFetchingLeo && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Activity className="h-4 w-4 animate-spin" />
            Atualizando...
          </div>
        )}
      </div>

      {/* Tabs para diferentes visões */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="health">Saúde do LEO</TabsTrigger>
          <TabsTrigger value="execution">Fluxo de Execução</TabsTrigger>
        </TabsList>

        {/* Visão Geral - Agregação de tudo */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* System Health (reuso do existente) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Saúde do Sistema
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Backend status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Backend:</span>
                    <span className={cn(
                      "text-sm font-medium",
                      systemHealth.backendReachable && systemHealth.httpOk ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {systemHealth.backendReachable && systemHealth.httpOk ? "Online" : "Offline"}
                    </span>
                  </div>

                  {/* Database status */}
                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Database:</span>
                      <span className={cn(
                        "text-sm font-medium",
                        systemHealth.data.database.status === "ok" ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {systemHealth.data.database.status}
                      </span>
                    </div>
                  )}

                  {/* Redis status */}
                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Redis:</span>
                      <span className={cn(
                        "text-sm font-medium",
                        systemHealth.data.redis.status === "ok" ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {systemHealth.data.redis.status}
                      </span>
                    </div>
                  )}

                  {/* Uptime */}
                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Uptime:</span>
                      <span className="text-sm font-medium">
                        {Math.floor(systemHealth.data.server.uptime / 60)}min
                      </span>
                    </div>
                  )}

                  {/* Response time */}
                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Response time:</span>
                      <span className="text-sm font-medium">
                        {systemHealth.data.responseTime}ms
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* LEO System Monitor */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Monitor do LEO
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leoSystemMonitorError ? (
                  <p className="text-sm text-rose-600">{leoSystemMonitorError}</p>
                ) : leoSystemMonitor ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Servidor:</span>
                      <span className={cn(
                        "text-sm font-medium",
                        leoSystemMonitor.servidor.online ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {leoSystemMonitor.servidor.online ? "Online" : "Offline"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Banco:</span>
                      <span className={cn(
                        "text-sm font-medium",
                        leoSystemMonitor.banco.conectado ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {leoSystemMonitor.banco.conectado ? "Conectado" : "Desconectado"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Alertas ativos:</span>
                      <span className={cn(
                        "text-sm font-medium",
                        leoSystemMonitor.aplicacao.alertasAtivos > 0 ? "text-amber-600" : "text-slate-600"
                      )}>
                        {leoSystemMonitor.aplicacao.alertasAtivos}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Erros recentes:</span>
                      <span className="text-sm font-medium">
                        {leoSystemMonitor.aplicacao.errosRecentes}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Memória:</span>
                      <span className="text-sm font-medium">
                        {Math.round(leoSystemMonitor.servidor.memoria.heapUsed / 1024 / 1024)}MB
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Carregando...</p>
                )}
              </CardContent>
            </Card>

            {/* Execution Registry Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Execuções
                </CardTitle>
              </CardHeader>
              <CardContent>
                {executionRecordsError ? (
                  <p className="text-sm text-rose-600">{executionRecordsError}</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Total:</span>
                      <span className="text-sm font-medium">
                        {executionRecordsTotal}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Concluídas:</span>
                      <span className="text-sm font-medium text-emerald-600">
                        {executionRecords.filter((r) => r.status === "completed").length}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Falhas:</span>
                      <span className="text-sm font-medium text-rose-600">
                        {executionRecords.filter((r) => r.status === "failed").length}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Bloqueadas:</span>
                      <span className="text-sm font-medium text-amber-600">
                        {executionRecords.filter((r) => r.status === "blocked").length}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Em andamento:</span>
                      <span className="text-sm font-medium text-blue-600">
                        {executionRecords.filter((r) => r.status === "started").length}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Latência cliente:</span>
                    <span className="text-sm font-medium">
                      {systemHealth.clientLatencyMs !== null ? `${systemHealth.clientLatencyMs}ms` : "—"}
                    </span>
                  </div>

                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Latência servidor:</span>
                      <span className="text-sm font-medium">
                        {systemHealth.data.responseTime}ms
                      </span>
                    </div>
                  )}

                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Memória heap:</span>
                      <span className="text-sm font-medium">
                        {systemHealth.data.memory.heapUsed}MB
                      </span>
                    </div>
                  )}

                  {systemHealth.data && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Ambiente:</span>
                      <span className="text-sm font-medium">
                        {systemHealth.data.server.environment}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Saúde do LEO - Detalhes do leo-system-monitor */}
        <TabsContent value="health">
          <LeoHealthPanel
            data={leoSystemMonitor}
            error={leoSystemMonitorError}
            isFetching={isFetchingLeo}
          />
        </TabsContent>

        {/* Fluxo de Execução - Detalhes do execution-registry */}
        <TabsContent value="execution">
          <ExecutionFlowPanel
            records={executionRecords}
            total={executionRecordsTotal}
            error={executionRecordsError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
