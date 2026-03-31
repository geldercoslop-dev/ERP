import React from "react";
import { Loader2, AlertCircle, SearchX, Inbox } from "lucide-react";
import { Button } from "../button";

/** 
 * LoadingState: Componente de carregamento padrão premium.
 */
export const LoadingState = ({ message = "Carregando dados..." }: { message?: string }) => (
  <div className="flex flex-col items-center justify-center p-20 text-slate-400 animate-in fade-in duration-500">
    <div className="relative mb-6">
      <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
      <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
    </div>
    <p className="text-sm font-black uppercase tracking-widest opacity-60">{message}</p>
  </div>
);

/** 
 * ErrorState: Componente de erro padrão com opção de recarregar.
 */
export const ErrorState = ({ 
  message = "Ocorreu um erro ao carregar os dados.", 
  onRetry 
}: { 
  message?: string; 
  onRetry?: () => void;
}) => (
  <div className="flex flex-col items-center justify-center p-12 text-slate-500 border-2 border-dashed rounded-3xl bg-rose-50/30 border-rose-100 animate-in zoom-in-95 duration-300">
    <div className="p-4 bg-rose-100 rounded-2xl mb-6">
      <AlertCircle className="h-8 w-8 text-rose-500" />
    </div>
    <h3 className="text-base font-black text-slate-900 uppercase tracking-tight mb-2">Falha na Requisição</h3>
    <p className="text-sm font-medium mb-6 text-center max-w-xs">{message}</p>
    {onRetry && (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onRetry}
        className="rounded-xl border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-all font-bold"
      >
        Tentar Novamente
      </Button>
    )}
  </div>
);

/** 
 * EmptyState: Componente de estado vazio (quando não há resultados).
 */
export const EmptyState = ({ 
  message = "Nenhum resultado encontrado.", 
  icon: Icon = Inbox,
  action
}: { 
  message?: string; 
  icon?: any;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center p-16 text-slate-400 border-2 border-dashed rounded-3xl bg-slate-50/50 border-slate-200 animate-in fade-in duration-700">
    <div className="p-4 bg-slate-100 rounded-full mb-6 opacity-60">
      <Icon className="h-10 w-10 text-slate-400" />
    </div>
    <p className="text-sm font-black uppercase tracking-widest text-slate-500 mb-6 text-center max-w-xs">{message}</p>
    {action && <div className="animate-in slide-in-from-bottom-2 duration-500">{action}</div>}
  </div>
);

