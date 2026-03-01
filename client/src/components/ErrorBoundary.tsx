import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    const msg = String((error as any)?.message ?? "");
    if ((error as any)?.name === "NotFoundError" && msg.includes("removeChild")) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Erro capturado pelo ErrorBoundary:', error, errorInfo);
    try {
      Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    } catch (_) {
      // Sentry não configurado ou indisponível – não quebra o app
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-lg p-6 shadow-lg border border-slate-700">
            <h2 className="text-xl font-bold text-red-400 mb-4">Erro no Aplicativo</h2>
            <p className="text-slate-300 mb-4">
              Ocorreu um erro inesperado. Por favor, tente recarregar a página.
            </p>
            <p className="text-slate-400 text-sm mb-4">
              Se o erro continuar, verifique se o servidor está rodando (terminal com <code className="bg-slate-800 px-1 rounded">pnpm run dev:windows</code>).
            </p>
            {this.state.error && (
              <div className="bg-slate-900 p-3 rounded text-sm font-mono text-slate-300 mb-4 overflow-auto max-h-[200px]">
                {this.state.error.toString()}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                Recarregar Página
              </button>
              <button
                onClick={() => window.location.href = "/"}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white"
              >
                Voltar ao início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;