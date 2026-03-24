import React, { useState, useEffect } from "react";
import { Sparkles, ThumbsUp, ThumbsDown, ArrowRight, Zap, TrendingUp, Package, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { eventBus } from "@/utils/eventBus";
import { useLocation } from "wouter";
import { leoDecisionEngine, type LeoInsight } from "@/automation/leoDecisionEngine";

/**
 * LeoInsightsPanel: Painel de inteligência operacional do LEO.
 * Exibe insights em tempo real e permite feedback do usuário.
 */
export function LeoInsightsPanel() {
  const [, setLocation] = useLocation();
  const [insights, setInsights] = useState<LeoInsight[]>([]);
  const [feedback, setFeedback] = useState<Record<string, "useful" | "ignored">>({});

  useEffect(() => {
    // Carregar iniciais
    setInsights(leoDecisionEngine.getInsights());

    // Escutar novos insights
    const off = eventBus.on("leo:insight", (insight: LeoInsight) => {
      setInsights(prev => {
        if (prev.find(i => i.id === insight.id)) return prev;
        return [insight, ...prev].slice(0, 5);
      });
    });

    return () => off();
  }, []);

  const handleFeedback = (id: string, type: "useful" | "ignored") => {
    setFeedback(prev => ({ ...prev, [id]: type }));
    if (type === "ignored") {
      setTimeout(() => {
        setInsights(prev => prev.filter(i => i.id !== id));
      }, 300);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "vendas": return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case "estoque": return <Package className="h-4 w-4 text-rose-500" />;
      case "financeiro": return <ShieldAlert className="h-4 w-4 text-amber-500" />;
      default: return <Zap className="h-4 w-4 text-primary" />;
    }
  };

  if (insights.length === 0) return <div className="text-muted-foreground text-sm">Nenhum insight disponível</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Inteligência LEO</h2>
        </div>
        <Badge variant="secondary" className="text-[10px] font-bold bg-slate-100 text-slate-500 border-none">
          {insights.length} INSIGHTS
        </Badge>
      </div>

      <div className="grid gap-4">
        {insights.map((insight) => (
          <Card 
            key={insight.id} 
            className={`rounded-2xl border-none shadow-sm overflow-hidden group hover:shadow-md transition-all duration-300 bg-white relative ${
              feedback[insight.id] === "ignored" ? "opacity-0 scale-95 translate-x-4" : "opacity-100"
            }`}
          >
            {/* Barra de prioridade lateral */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              insight.priority === "high" ? "bg-rose-500" : insight.priority === "medium" ? "bg-amber-500" : "bg-blue-500"
            }`} />

            <CardContent className="p-5">
              <div className="flex gap-4">
                <div className="p-3 rounded-xl bg-slate-50 h-fit shrink-0 group-hover:scale-110 transition-transform duration-300">
                  {getCategoryIcon(insight.category)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-black text-slate-900 truncate">{insight.title}</h3>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleFeedback(insight.id, "useful")}
                        className={`p-1.5 rounded-lg transition-colors ${feedback[insight.id] === "useful" ? "bg-emerald-50 text-emerald-600" : "hover:bg-slate-100 text-slate-400"}`}
                        title="Útil"
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button 
                        onClick={() => handleFeedback(insight.id, "ignored")}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Ignorar"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                    {insight.message}
                  </p>

                  {insight.actionHref && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setLocation(insight.actionHref!)}
                      className="h-8 px-4 text-[10px] font-black uppercase tracking-wider rounded-xl border-primary/20 text-primary hover:bg-primary hover:text-white transition-all gap-2"
                    >
                      {insight.actionLabel || "Executar Ação"}
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
