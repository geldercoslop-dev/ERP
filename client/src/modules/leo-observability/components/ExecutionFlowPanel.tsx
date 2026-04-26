/**
 * ExecutionFlowPanel - Componente de exibição do ExecutionRegistry
 * 
 * Exibe dados do execution-registry.ts (read-only):
 * - Lista de execuções recentes
 * - Origin (origem da execução)
 * - Actor (quem executou)
 * - TenantId
 * - Entrypoint
 * - Status (started/completed/failed/blocked)
 * - Timestamp
 * - Duration (quando disponível)
 * 
 * PRINCÍPIO: apenas leitura, não modificar registry
 */

import React from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Play,
  User,
  Building2,
  Code,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils";
import type { ExecutionRecord } from "../hooks/useLeoObservability";

type ExecutionFlowPanelProps = {
  records: ExecutionRecord[];
  total: number;
  error: string | null;
};

function getStatusIcon(status: ExecutionRecord["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-emerald-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-rose-600" />;
    case "blocked":
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case "started":
      return <Play className="h-4 w-4 text-blue-600" />;
    default:
      return <Clock className="h-4 w-4 text-slate-600" />;
  }
}

function getStatusBadge(status: ExecutionRecord["status"]) {
  switch (status) {
    case "completed":
      return (
        <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200">
          Concluído
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-rose-50 text-rose-800 border-rose-200">
          Falhou
        </Badge>
      );
    case "blocked":
      return (
        <Badge className="bg-amber-50 text-amber-800 border-amber-200">
          Bloqueado
        </Badge>
      );
    case "started":
      return (
        <Badge className="bg-blue-50 text-blue-800 border-blue-200">
          Em andamento
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          {status}
        </Badge>
      );
  }
}

export function ExecutionFlowPanel({ records, total, error }: ExecutionFlowPanelProps) {
  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardHeader>
          <CardTitle className="text-lg text-rose-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Erro ao carregar registros de execução
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-rose-700">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const displayRecords = records.slice(0, 20); // Mostrar apenas os 20 mais recentes

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Code className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Fluxo de Execução</h3>
            <p className="text-xs text-slate-500">
              {total} registro{total !== 1 ? "s" : ""} total{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Lista de execuções */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Execuções Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {displayRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma execução registrada
            </p>
          ) : (
            <div className="space-y-2">
              {displayRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  {/* Status icon */}
                  <div className="mt-0.5">
                    {getStatusIcon(record.status)}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-600">
                        {record.id.slice(-12)}
                      </span>
                      {getStatusBadge(record.status)}
                      <span className="text-xs text-slate-500">
                        {new Date(record.timestamp).toLocaleString()}
                      </span>
                    </div>

                    {/* Origin and actor */}
                    <div className="flex items-center gap-3 text-xs text-slate-700 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <span className="font-medium">{record.origin}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{record.actor}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Tenant:</span>
                        <span className="font-medium">{record.tenantId}</span>
                      </div>
                    </div>

                    {/* Entrypoint */}
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <Code className="h-3 w-3" />
                      <span className="font-mono">{record.entrypoint}</span>
                    </div>

                    {/* Error if present */}
                    {record.error && (
                      <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded">
                        {record.error}
                      </div>
                    )}

                    {/* Duration if present */}
                    {record.duration !== undefined && (
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <Timer className="h-3 w-3" />
                        <span>{record.duration}ms</span>
                      </div>
                    )}

                    {/* Trace ID if present */}
                    {record.traceId && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <span className="font-mono">trace: {record.traceId}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > displayRecords.length && (
            <p className="text-xs text-slate-500 text-center mt-3">
              Mostrando {displayRecords.length} de {total} registros
            </p>
          )}
        </CardContent>
      </Card>

      {/* Estatísticas rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums text-emerald-600">
                {records.filter((r) => r.status === "completed").length}
              </p>
              <p className="text-xs text-slate-600">Concluídas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums text-rose-600">
                {records.filter((r) => r.status === "failed").length}
              </p>
              <p className="text-xs text-slate-600">Falhas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums text-amber-600">
                {records.filter((r) => r.status === "blocked").length}
              </p>
              <p className="text-xs text-slate-600">Bloqueadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums text-blue-600">
                {records.filter((r) => r.status === "started").length}
              </p>
              <p className="text-xs text-slate-600">Em andamento</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
