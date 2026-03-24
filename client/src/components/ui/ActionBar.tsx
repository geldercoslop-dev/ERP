import React from "react";
import { Plus, ShoppingCart, UserPlus, Truck, PackagePlus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuickActions } from "@/hooks/useQuickActions";

/**
 * ActionBar: Barra de ações rápidas no topo do ERP.
 * Permite navegação imediata para as operações mais comuns.
 */
export const ActionBar = () => {
  const [, setLocation] = useLocation();
  const { openQuickClient, openQuickProduct } = useQuickActions();

  const actions = [
    { label: "Nova Venda", icon: ShoppingCart, onClick: () => setLocation("/nova-venda"), color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Novo Cliente", icon: UserPlus, onClick: openQuickClient, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Novo Produto", icon: Package, onClick: openQuickProduct, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "Nova Carga", icon: Truck, onClick: () => setLocation("/cargas"), color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Entrada Produto", icon: PackagePlus, onClick: () => setLocation("/nota-entrada"), color: "text-amber-600", bg: "bg-amber-50" },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="ghost"
          size="sm"
          className={`shrink-0 flex items-center gap-2 h-9 px-3 rounded-xl border border-transparent hover:border-current/10 transition-all duration-200 ${action.bg} ${action.color}`}
          onClick={action.onClick}
        >
          <action.icon className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wide">{action.label}</span>
        </Button>
      ))}
    </div>
  );
};
