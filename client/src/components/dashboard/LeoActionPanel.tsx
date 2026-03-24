import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Check,
  Loader,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionStatus = "pending" | "confirmed" | "executed" | "rejected";

interface LeoAction {
  id: string;
  title: string;
  description: string;
  action: string;
  status: ActionStatus;
  timestamp: Date;
  suggestedBy: string;
  impact?: "high" | "medium" | "low";
}

const StatusIcon = ({ status }: { status: ActionStatus }) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-amber-600 animate-pulse" />;
    case "confirmed":
      return <AlertCircle className="h-4 w-4 text-blue-600" />;
    case "executed":
      return <CheckCircle className="h-4 w-4 text-emerald-600" />;
    case "rejected":
      return <X className="h-4 w-4 text-slate-400" />;
  }
};

const StatusBadge = ({ status }: { status: ActionStatus }) => {
  const variants = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    executed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-slate-50 text-slate-700 border-slate-200",
  };

  const labels = {
    pending: "Pendente",
    confirmed: "Confirmada",
    executed: "Executada",
    rejected: "Rejeitada",
  };

  return (
    <Badge variant="outline" className={variants[status]}>
      {labels[status]}
    </Badge>
  );
};

const ImpactBadge = ({ impact }: { impact?: "high" | "medium" | "low" }) => {
  if (!impact) return null;

  const variants = {
    high: "bg-rose-50 text-rose-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-slate-50 text-slate-700",
  };

  const labels = {
    high: "Alto Impacto",
    medium: "Médio Impacto",
    low: "Baixo Impacto",
  };

  return (
    <Badge variant="secondary" className={variants[impact]}>
      {labels[impact]}
    </Badge>
  );
};

export function LeoActionPanel() {
  const [actions, setActions] = useState<LeoAction[]>([
    {
      id: "1",
      title: "Criar Pedido #12345",
      description: "Cliente João Silva quer 10x Cadeira Gamer vermelha",
      action: "create_order",
      status: "pending",
      timestamp: new Date(Date.now() - 300000),
      suggestedBy: "LEO (Análise de Chat)",
      impact: "high",
    },
    {
      id: "2",
      title: "Alertar sobre Estoque Baixo",
      description: "Produto 'Monitor 4K' com apenas 5 unidades",
      action: "stock_alert",
      status: "pending",
      timestamp: new Date(Date.now() - 600000),
      suggestedBy: "LEO (Monitoramento)",
      impact: "medium",
    },
    {
      id: "3",
      title: "Enviar Lembrete de Pagamento",
      description: "Fatura #5000 vencida em 2 dias - Cliente XYZ",
      action: "payment_reminder",
      status: "confirmed",
      timestamp: new Date(Date.now() - 1800000),
      suggestedBy: "LEO (Análise Financeira)",
      impact: "high",
    },
    {
      id: "4",
      title: "Agendar Revisão com Vendedor",
      description: "João - Vendedor abaixo da meta há 2 semanas",
      action: "schedule_review",
      status: "executed",
      timestamp: new Date(Date.now() - 3600000),
      suggestedBy: "LEO (Performance)",
      impact: "medium",
    },
  ]);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleConfirm = async (id: string) => {
    setConfirmingId(id);
    // Simular latência de processamento
    await new Promise((resolve) => setTimeout(resolve, 600));
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "confirmed" } : a))
    );
    setConfirmingId(null);
  };

  const handleExecute = async (id: string) => {
    setConfirmingId(id);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "executed" } : a))
    );
    setConfirmingId(null);
  };

  const handleReject = (id: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "rejected" } : a))
    );
  };

  const pendingActions = actions.filter((a) => a.status === "pending");
  const confirmedActions = actions.filter((a) => a.status === "confirmed");
  const executedActions = actions.filter((a) => a.status === "executed");

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "Agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return `${Math.floor(diff / 86400)}d atrás`;
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho com resumo */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Zap className="h-5 w-5 text-primary animate-pulse" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Painel de Ações LEO</h3>
            <p className="text-xs text-slate-500">
              {pendingActions.length} pendente
              {confirmedActions.length > 0 && ` • ${confirmedActions.length} confirmada`}
            </p>
          </div>
        </div>
        <Badge className="bg-primary/10 text-primary border-none">
          {actions.length} ações
        </Badge>
      </div>

      {/* Seção Pendentes */}
      {pendingActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            ⏳ Aguardando Aprovação ({pendingActions.length})
          </h4>
          <div className="space-y-2">
            {pendingActions.map((action) => (
              <Card key={action.id} className="border-amber-100 bg-amber-50/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={action.status} />
                        <p className="font-semibold text-slate-900">
                          {action.title}
                        </p>
                        {action.impact && (
                          <ImpactBadge impact={action.impact} />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 ml-6">
                        {action.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 ml-6">
                        <span>Por: {action.suggestedBy}</span>
                        <span>•</span>
                        <span>{formatTime(action.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleConfirm(action.id)}
                      disabled={confirmingId === action.id}
                    >
                      {confirmingId === action.id ? (
                        <>
                          <Loader className="h-3 w-3 animate-spin mr-1" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Confirmar
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleReject(action.id)}
                      disabled={confirmingId === action.id}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Rejeitar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Seção Confirmadas */}
      {confirmedActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            ✓ Confirmadas ({confirmedActions.length})
          </h4>
          <div className="space-y-2">
            {confirmedActions.map((action) => (
              <Card key={action.id} className="border-blue-100 bg-blue-50/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={action.status} />
                        <p className="font-semibold text-slate-900">
                          {action.title}
                        </p>
                        <StatusBadge status={action.status} />
                      </div>
                      <p className="text-sm text-slate-600 ml-6">
                        {action.description}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleExecute(action.id)}
                    disabled={confirmingId === action.id}
                  >
                    {confirmingId === action.id ? (
                      <>
                        <Loader className="h-3 w-3 animate-spin mr-1" />
                        Executando...
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3 mr-1" />
                        Executar Agora
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Seção Executadas */}
      {executedActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            ✓ Executadas ({executedActions.length})
          </h4>
          <div className="space-y-1">
            {executedActions.map((action) => (
              <Card key={action.id} className="border-emerald-100 bg-emerald-50/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={action.status} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {action.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        Executada {formatTime(action.timestamp)}
                      </p>
                    </div>
                    <StatusBadge status={action.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Estado Vazio */}
      {actions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Zap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">
              Nenhuma ação do LEO no momento
            </p>
            <p className="text-xs text-slate-400">
              As ações aparecerão aqui quando o LEO detectar oportunidades
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
