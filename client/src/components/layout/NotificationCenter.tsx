import React, { useState } from "react";
import { Bell, X, CheckCircle2, AlertCircle, Info, Package, Truck, DollarSign } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

export interface Notification {
  id: string;
  title: string;
  description: string;
  type: "info" | "success" | "warning" | "error";
  category: "pedido" | "carga" | "financeiro" | "sistema";
  time: string;
  read: boolean;
}

/**
 * NotificationCenter: Central de notificações no header do ERP.
 * Exibe alertas de sistema, novos pedidos e baixas financeiras.
 */
export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      title: "Novo Pedido",
      description: "O pedido #1245 foi gerado por VENDEDOR TESTE.",
      type: "success",
      category: "pedido",
      time: "2 min atrás",
      read: false
    },
    {
      id: "2",
      title: "Estoque Baixo",
      description: "5 produtos atingiram o estoque mínimo.",
      type: "warning",
      category: "sistema",
      time: "10 min atrás",
      read: false
    },
    {
      id: "3",
      title: "Carga Entregue",
      description: "A carga #88 foi finalizada com sucesso.",
      type: "info",
      category: "carga",
      time: "1 hora atrás",
      read: true
    }
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const getIcon = (category: string) => {
    switch (category) {
      case "pedido": return <Package className="h-4 w-4 text-blue-600" />;
      case "carga": return <Truck className="h-4 w-4 text-purple-600" />;
      case "financeiro": return <DollarSign className="h-4 w-4 text-emerald-600" />;
      default: return <Info className="h-4 w-4 text-slate-600" />;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-primary transition-all duration-200 group">
          <Bell className="h-5 w-5 group-hover:scale-110 transition-transform" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-rose-500 border-2 border-white text-[10px] text-white font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 rounded-2xl shadow-2xl border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Notificações</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-7 text-[10px] font-bold uppercase text-primary hover:bg-primary/5">
              Lidas
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-10" />
              <p className="text-xs">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifications.map((n) => (
                <div 
                  key={n.id} 
                  className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer relative ${!n.read ? 'bg-blue-50/30' : ''}`}
                >
                  {!n.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                  <div className="flex gap-3">
                    <div className="p-2 rounded-lg bg-white shadow-sm shrink-0 h-fit">
                      {getIcon(n.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 mb-0.5">{n.title}</div>
                      <div className="text-[11px] text-slate-500 leading-relaxed mb-1.5">{n.description}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{n.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-slate-50 bg-slate-50/30">
          <Button variant="ghost" className="w-full h-8 text-[10px] font-bold uppercase text-slate-400 hover:text-slate-600">
            Ver todas as notificações
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
