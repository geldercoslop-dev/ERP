import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertCircle, HardDrive, Clock, Zap, Server, Database, Cpu, DatabaseZap } from 'lucide-react';
import { HealthCard } from '@/components/HealthCard';
import { StatusBadge } from '@/components/StatusBadge';
import { MetricBox } from '@/components/MetricBox';
import { analyzeHealth, HealthAnalysis, getHealthTrend, formatHealthScore } from '@/utils/health-analyzer';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import type { SystemHealthPayload } from '@/types/system-health';

export default function SystemHealth() {
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
  } = useSystemHealth(5000);

  const [analysis, setAnalysis] = useState<HealthAnalysis | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<HealthAnalysis | null>(null);
  const prevRef = useRef<HealthAnalysis | null>(null);

  useEffect(() => {
    if (!data) return;
    const next = analyzeHealth(data);
    setPreviousAnalysis(prevRef.current);
    prevRef.current = next;
    setAnalysis(next);
  }, [data]);

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getTrend = () => {
    if (!analysis || !previousAnalysis) return undefined;
    return getHealthTrend(analysis, previousAnalysis);
  };

  const showSkeleton = !initialized && isFetching;
  const health: SystemHealthPayload | null = data;
  const backendOnline = backendReachable && httpOk;

  if (showSkeleton) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const trend = getTrend();

  return (
    <div className="p-6 space-y-6">
      {fetchError ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 flex gap-3 items-start"
        >
          <AlertCircle className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-900">
            <p className="font-semibold">Alerta: não foi possível atualizar o painel</p>
            <p className="text-rose-800">{fetchError}</p>
            <button
              type="button"
              className="mt-2 text-xs font-medium underline text-rose-900 hover:text-rose-700"
              onClick={() => void refetch()}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      {!backendOnline && !fetchError ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          O backend respondeu com estado degradado (HTTP não OK). Verifique logs do servidor.
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Painel de Saúde do Sistema</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            API: {backendOnline ? 'online' : backendReachable ? 'degradada' : 'offline'}
          </span>
          {analysis ? (
            <StatusBadge status={analysis.level === 'warn' ? 'warning' : analysis.level} />
          ) : null}
          <span className="text-xs text-muted-foreground">
            Última atualização: {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </span>
          {clientLatencyMs != null ? (
            <span className="text-xs text-muted-foreground">
              Latência cliente: {clientLatencyMs} ms
            </span>
          ) : null}
        </div>
      </div>

      {/* Resumo rápido quando ainda não há análise (sem dados válidos) */}
      {!health || !analysis ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {!health
              ? 'Nenhum dado de saúde disponível. Confirme se o servidor está em execução e o proxy /api está configurado.'
              : 'Calculando análise…'}
          </CardContent>
        </Card>
      ) : null}

      {health && analysis ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <HealthCard
              title="Score Saúde"
              value={analysis.score}
              unit="/100"
              status={analysis.level === 'warn' ? 'warning' : analysis.level}
              icon={Activity}
              subtitle={formatHealthScore(analysis.score)}
              trend={trend === 'improving' ? 'up' : trend === 'degrading' ? 'down' : 'stable'}
            />

            <HealthCard
              title="Uptime"
              value={formatUptime(health.server.uptime)}
              status="ok"
              icon={Clock}
              subtitle={health.server.uptimeFormatted}
            />

            <HealthCard
              title="Memória"
              value={health.memory.heapUsed}
              unit="MB"
              status={analysis.metrics.resource > 70 ? 'critical' : analysis.metrics.resource > 50 ? 'warning' : 'ok'}
              icon={HardDrive}
              subtitle={`Total: ${health.memory.heapTotal}MB`}
            />

            <HealthCard
              title="Banco de Dados"
              value={health.database.responseTime}
              unit="ms"
              status={health.database.status === 'error' ? 'critical' : health.database.responseTime > 1000 ? 'warning' : 'ok'}
              icon={Database}
              subtitle={health.database.status}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <HealthCard
              title="Redis"
              value={health.redis.responseTime}
              unit="ms"
              status={health.redis.status === 'ok' ? 'ok' : health.redis.status === 'slow' ? 'warning' : 'critical'}
              icon={DatabaseZap}
              subtitle={health.redis.status === 'ok' ? 'Conectado' : health.redis.error ?? health.redis.status}
            />

            <HealthCard
              title="Tempo API (servidor)"
              value={health.responseTime}
              unit="ms"
              status={health.responseTime > 1000 ? 'warning' : 'ok'}
              icon={Zap}
              subtitle="Processamento do health check"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricBox
              title="Performance"
              value={analysis.metrics.performance}
              format="percentage"
              threshold={{ good: 80, warning: 60, critical: 40 }}
              icon={Zap}
              description="Tempo de resposta e processamento"
            />

            <MetricBox
              title="Confiabilidade"
              value={analysis.metrics.reliability}
              format="percentage"
              threshold={{ good: 85, warning: 65, critical: 45 }}
              icon={Server}
              description="Estabilidade e disponibilidade"
            />

            <MetricBox
              title="Recursos"
              value={analysis.metrics.resource}
              format="percentage"
              threshold={{ good: 75, warning: 55, critical: 35 }}
              icon={Cpu}
              description="Uso de memória e CPU"
            />

            <MetricBox
              title="Ambiente"
              value={analysis.metrics.environment}
              format="percentage"
              threshold={{ good: 90, warning: 70, critical: 50 }}
              icon={Activity}
              description="Configurações e variáveis"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações do Servidor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Ambiente:</span>
                  <span className="text-sm font-medium">{health.server.environment}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Node.js:</span>
                  <span className="text-sm font-medium">{health.server.nodeVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Plataforma:</span>
                  <span className="text-sm font-medium">{health.server.platform} ({health.server.arch})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Versão App:</span>
                  <span className="text-sm font-medium">{health.version.app}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Variáveis de Ambiente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">DATABASE_URL:</span>
                  <span className={`text-sm font-medium ${health.environment.DATABASE_URL ? 'text-green-600' : 'text-red-600'}`}>
                    {health.environment.DATABASE_URL ? '✓ Configurado' : '✗ Ausente'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">DB_HOST:</span>
                  <span className={`text-sm font-medium ${health.environment.DB_HOST ? 'text-green-600' : 'text-red-600'}`}>
                    {health.environment.DB_HOST ? '✓ Configurado' : '✗ Ausente'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">DB_NAME:</span>
                  <span className={`text-sm font-medium ${health.environment.DB_NAME ? 'text-green-600' : 'text-red-600'}`}>
                    {health.environment.DB_NAME ? '✓ Configurado' : '✗ Ausente'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">PORT:</span>
                  <span className={`text-sm font-medium ${health.environment.PORT ? 'text-green-600' : 'text-red-600'}`}>
                    {health.environment.PORT ? '✓ Configurado' : '✗ Ausente'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className={analysis.level === 'critical' ? 'border-red-200 bg-red-50' : analysis.level === 'warn' ? 'border-yellow-200 bg-yellow-50' : ''}>
              <CardHeader>
                <CardTitle className="text-lg">Issues Detectados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.issues.map((issue, index) => (
                    <div key={index} className="text-sm p-2 bg-white rounded border">
                      {issue}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recomendações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.recommendations.map((rec, index) => (
                    <div key={index} className="text-sm p-2 bg-blue-50 rounded border border-blue-200">
                      💡 {rec}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {health.database.error ? (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-800 flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Erro no Banco de Dados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-700">{health.database.error}</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
