import React from "react";
import { AlertTriangle, AlertCircle, Clock, PackageSearch, CreditCard, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

/**
 * AlertsPanel: Painel de alertas operacionais críticos.
 * Exibe estoque baixo, pedidos atrasados e pagamentos vencidos.
 */
export const AlertsPanel = ({ 
  lowStockCount = 0, 
  lateOrdersCount = 0, 
  overduePaymentsCount = 0 
}: { 
  lowStockCount?: number; 
  lateOrdersCount?: number; 
  overduePaymentsCount?: number;
}) => {
  const [, setLocation] = useLocation();

  const alerts = [
    { 
      id: "low-stock", 
      label: "Estoque Crítico", 
      category: "estoque",
      count: lowStockCount, 
      icon: PackageSearch, 
      color: "text-rose-600", 
      bg: "bg-rose-50", 
      href: "/estoque?filtro=baixo" 
    },
    { 
      id: "late-orders", 
      label: "Logística: Atrasos", 
      category: "logistica",
      count: lateOrdersCount, 
      icon: Clock, 
      color: "text-amber-600", 
      bg: "bg-amber-50", 
      href: "/meus-pedidos?status=atrasado" 
    },
    { 
      id: "overdue-payments", 
      label: "Financeiro: Vencidos", 
      category: "financeiro",
      count: overduePaymentsCount, 
      icon: CreditCard, 
      color: "text-orange-600", 
      bg: "bg-orange-50", 
      href: "/contas-receber?status=vencido" 
    },
  ].filter(a => a.count > 0);

  if (alerts.length === 0) return <div className="text-muted-foreground text-sm">Nenhum alerta</div>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {alerts.map((alert) => (
        <button
          key={alert.id}
          onClick={() => setLocation(alert.href)}
          className={`flex items-center gap-4 p-4 rounded-2xl border border-transparent hover:border-current/10 transition-all duration-200 text-left ${alert.bg} ${alert.color} group`}
        >
          <div className="p-3 rounded-xl bg-white shadow-sm shrink-0 group-hover:scale-110 transition-transform duration-300">
            <alert.icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-70">{alert.label}</div>
              <Badge variant="outline" className="text-[8px] h-3 px-1 border-current/20 font-bold uppercase">
                {alert.category}
              </Badge>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-2xl font-black leading-none">{alert.count}</span>
              <ArrowRight className="h-4 w-4 opacity-50 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};
