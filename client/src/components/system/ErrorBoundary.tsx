import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * ErrorBoundary: Captura erros críticos do React e evita que o app inteiro quebre.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <Card className="max-w-md w-full border-none shadow-2xl overflow-hidden rounded-2xl">
            <div className="h-2 bg-rose-500" />
            <CardHeader className="text-center pt-8">
              <div className="mx-auto w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-rose-500" />
              </div>
              <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">Ops! Algo deu errado</CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-8 space-y-6">
              <p className="text-sm text-slate-500 font-medium">
                Ocorreu um erro inesperado na interface. Nossa equipe foi notificada (se o Sentry estiver ativo).
              </p>
              
              {this.state.error && (
                <div className="p-3 bg-slate-100 rounded-lg text-[10px] font-mono text-slate-600 text-left overflow-auto max-h-32">
                  {this.state.error.message}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button 
                  onClick={() => window.location.reload()} 
                  className="w-full bg-slate-900 hover:bg-slate-800 gap-2 font-bold"
                >
                  <RefreshCcw className="h-4 w-4" /> Recarregar Sistema
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => (window.location.href = "/dashboard")} 
                  className="w-full gap-2 font-bold"
                >
                  <Home className="h-4 w-4" /> Ir para Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
