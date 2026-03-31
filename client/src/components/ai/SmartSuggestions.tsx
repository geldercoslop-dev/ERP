import React, { useState, useEffect } from "react";
import { Zap, ArrowRight, X, Sparkles, Package, Truck, DollarSign } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { eventBus } from "../../utils/eventBus";
import { useLocation } from "wouter";

export interface Suggestion {
  id: string;
  title: string;
  message: string;
  type: "operacional" | "estoque" | "financeiro" | "logistica";
  actionLabel?: string;
  actionHref?: string;
}

/**
 * SmartSuggestions: Componente de sugestões inteligentes do ERP.
 * Exibe recomendações de fluxo baseadas em eventos recentes.
 */
export function SmartSuggestions() {
  const [, setLocation] = useLocation();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([
    {
      id: "initial-1",
      title: "Agrupar Pedidos",
      message: "Existem 5 pedidos prontos para entrega na mesma região.",
      type: "logistica",
      actionLabel: "Ver Rota",
      actionHref: "/cargas"
    }
  ]);

  useEffect(() => {
    // Escuta novas sugestões emitidas pelo WorkflowEngine
    const off = eventBus.on("suggestion:new", (newSuggestion: Suggestion) => {
      setSuggestions(prev => {
        if (prev.find(s => s.id === newSuggestion.id)) return prev;
        return [newSuggestion, ...prev].slice(0, 3); // Mantém apenas as 3 mais recentes
      });
    });

    return () => off();
  }, []);

  const removeSuggestion = (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "estoque": return <Package className="h-4 w-4 text-rose-500" />;
      case "logistica": return <Truck className="h-4 w-4 text-purple-500" />;
      case "financeiro": return <DollarSign className="h-4 w-4 text-emerald-500" />;
      default: return <Zap className="h-4 w-4 text-amber-500" />;
    }
  };

  if (suggestions.length === 0) return <div className="text-muted-foreground text-sm">Nenhuma sugestão disponível</div>;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sugestões Inteligentes</h3>
      </div>
      
      {suggestions.map((s) => (
        <Card key={s.id} className="rounded-2xl border-none shadow-sm overflow-hidden group hover:shadow-md transition-all duration-300 relative bg-white">
          <button 
            onClick={() => removeSuggestion(s.id)}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors z-10"
          >
            <X className="h-3 w-3" />
          </button>
          
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className={`p-2 rounded-xl h-fit bg-slate-50 group-hover:scale-110 transition-transform duration-300`}>
                {getIcon(s.type)}
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <div className="text-xs font-bold text-slate-900 mb-0.5 truncate">{s.title}</div>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3 line-clamp-2">
                  {s.message}
                </p>
                {s.actionHref && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setLocation(s.actionHref!)}
                    className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider rounded-xl border-primary/20 text-primary hover:bg-primary hover:text-white transition-all gap-2"
                  >
                    {s.actionLabel || "Ver Detalhes"}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
