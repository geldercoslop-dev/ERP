import React, { useState } from "react";
import {
  Activity,
  Zap,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HealthMonitor } from "@/components/dashboard/HealthMonitor";
import { LeoActionPanel } from "@/components/dashboard/LeoActionPanel";
import { LeoDashboard } from "@/components/ai/LeoDashboard";
import { Badge } from "@/components/ui/badge";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { cn } from "@/lib/utils";

/**
 * ControlPanel: Painel centralizado com:
 * 1. Dashboard de Saúde (tempo real)
 * 2. Dashboard de Insights (LEO)
 * 3. Painel de Ações LEO
 */
export default function ControlPanel() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const healthSnapshot = useSystemHealth(5000);
  const { data, clientLatencyMs, backendReachable, httpOk, fetchError } = healthSnapshot;
  const backendOk = backendReachable && httpOk;
  const redisLabel =
    data?.redis.status === "ok"
      ? "OK"
      : data
        ? "Falha"
        : "—";
  const heapFreeMb =
    data != null ? Math.max(0, data.memory.heapTotal - data.memory.heapUsed) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Cabeçalho Profissional */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-primary to-blue-600 rounded-lg shadow-lg">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Control Center
                </h1>
              </div>
              <p className="text-sm text-slate-600 ml-11">
                Painel centralizado de saúde, inteligência e ações
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className={cn(
                  "border-none",
                  backendOk && !fetchError
                    ? "bg-emerald-100 text-emerald-700"
                    : fetchError
                      ? "bg-rose-100 text-rose-800"
                      : "bg-amber-100 text-amber-800"
                )}
              >
                {fetchError
                  ? "⚠ Backend inacessível"
                  : backendOk
                    ? "🟢 API operacional"
                    : "⚠ API degradada"}
              </Badge>
            </div>
          </div>

          {/* Status Overview Mini */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:shadow-sm transition-shadow">
              <p className="text-xs text-slate-600 font-medium">Latência (cliente)</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">
                {clientLatencyMs != null ? `${clientLatencyMs} ms` : "—"}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:shadow-sm transition-shadow">
              <p className="text-xs text-slate-600 font-medium">Uptime (processo)</p>
              <p className="text-lg font-bold text-emerald-600 truncate">
                {data?.server.uptimeFormatted ?? "—"}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:shadow-sm transition-shadow">
              <p className="text-xs text-slate-600 font-medium">Redis</p>
              <p className="text-lg font-bold text-slate-900">{redisLabel}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center hover:shadow-sm transition-shadow">
              <p className="text-xs text-slate-600 font-medium">Heap livre (aprox.)</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums">
                {heapFreeMb != null ? `${heapFreeMb} MB` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs Principal */}
        <Tabs defaultValue="health" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-white border border-slate-200 p-1">
            <TabsTrigger
              value="health"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white gap-2"
            >
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Saúde</span>
            </TabsTrigger>
            <TabsTrigger
              value="insights"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-600 data-[state=active]:text-white gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Insights</span>
            </TabsTrigger>
            <TabsTrigger
              value="actions"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-600 data-[state=active]:text-white gap-2"
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Ações</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Health Dashboard */}
          <TabsContent value="health" className="space-y-6">
            <Card className="border-0 shadow-md bg-white/95 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="p-1 bg-blue-100 rounded">
                      <Activity className="h-4 w-4 text-blue-600" />
                    </div>
                    Dashboard de Saúde em Tempo Real
                  </CardTitle>
                  <Badge variant="outline" className="bg-blue-50">
                    Atualiza a cada 5s
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <HealthMonitor snapshot={healthSnapshot} />
              </CardContent>
            </Card>

            {/* Configurações de Monitoramento */}
            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between hover:bg-slate-50"
                >
                  <span className="font-semibold">Configurações de Alertas</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      settingsOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4 p-4 bg-slate-50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Limiar de Memória (%)
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    defaultValue="80"
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500">
                    Alerta quando memória ultrapassar 80%
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Latência Máxima (ms)
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="1000"
                    step="50"
                    defaultValue="500"
                    className="w-full"
                  />
                  <p className="text-xs text-slate-500">
                    Alerta quando latência ultrapassar 500ms
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* TAB 2: Insights Dashboard */}
          <TabsContent value="insights" className="space-y-6">
            <Card className="border-0 shadow-md bg-white/95 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="p-1 bg-purple-100 rounded">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                    </div>
                    Análise Inteligente LEO
                  </CardTitle>
                  <Badge variant="outline" className="bg-purple-50">
                    Dados em Tempo Real
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <LeoDashboard />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: LEO Actions */}
          <TabsContent value="actions" className="space-y-6">
            <Card className="border-0 shadow-md bg-white/95 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <div className="p-1 bg-amber-100 rounded">
                      <Zap className="h-4 w-4 text-amber-600" />
                    </div>
                    Painel de Ações Inteligentes
                  </CardTitle>
                  <Badge variant="outline" className="bg-amber-50">
                    3 Pendentes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <LeoActionPanel />
              </CardContent>
            </Card>

            {/* Info de Integração */}
            <Card className="border-dashed border-slate-300 bg-slate-50/50">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">
                    💡 Como LEO Funciona?
                  </p>
                  <ul className="text-xs text-slate-600 space-y-1 ml-4">
                    <li>
                      ✓ LEO monitora continuamente estoque, vendas e finanças
                    </li>
                    <li>
                      ✓ Detecta oportunidades (novos pedidos, alertas, etc)
                    </li>
                    <li>✓ Sugere ações automáticas para aprovação</li>
                    <li>✓ Você confirma e LEO executa as operações</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-center gap-4 text-xs text-slate-500 py-4 border-t border-slate-200">
          <span>📍 Control Center v1.0</span>
          <span>•</span>
          <span>🔄 Saúde: polling a cada 5s (/api/system/health)</span>
          <span>•</span>
          <span>📱 Responsivo para desktop e mobile</span>
        </div>
      </div>
    </div>
  );
}
