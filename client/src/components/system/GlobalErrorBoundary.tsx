import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { logger } from "../../lib/logger/frontendLogger";

type GlobalErrorBoundaryProps = {
  children: ReactNode;
};

type GlobalErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  requestId?: string;
};

export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  public state: GlobalErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const requestId = this.extractRequestId(error.message);
    this.setState({ requestId });

    logger.error("Erro crítico capturado no React boundary", {
      component: "GlobalErrorBoundary",
      action: "react_crash",
      requestId,
      details: { componentStack: errorInfo.componentStack },
    }, error);

    try {
      Sentry.captureException(error, {
        extra: {
          requestId,
          componentStack: errorInfo.componentStack,
        },
      });
    } catch {
      // Sentry opcional no ambiente local
    }
  }

  private extractRequestId(message: string): string | undefined {
    const match = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    return match?.[0];
  }

  public render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <Card className="max-w-md w-full border-none shadow-2xl overflow-hidden rounded-2xl">
          <div className="h-2 bg-rose-500" />
          <CardHeader className="text-center pt-8">
            <div className="mx-auto w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-rose-500" />
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
              Ops! Algo deu errado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center pb-8 space-y-6">
            <p className="text-sm text-slate-500 font-medium">
              Ocorreu um erro inesperado na interface.
            </p>

            {this.state.requestId ? (
              <p className="text-xs text-slate-500">
                requestId: <code>{this.state.requestId}</code>
              </p>
            ) : null}

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
                <Home className="h-4 w-4" /> Ir para Inicio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default GlobalErrorBoundary;
