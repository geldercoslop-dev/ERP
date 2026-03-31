/**
 * ErrorBoundaryPro - Resiliência de UI de Nível Produção
 * 
 * Features:
 * - Captura erros React com logging estruturado
 * - Fallback UI amigável
 * - Integração com Sentry (se disponível)
 * - Retry automático com estado
 * - Type-safe
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { frontendLogger } from '../monitoring/frontend-logger';
import type { AppError } from '../types/error';

interface ErrorBoundaryProProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean; // Se true, não renderiza children mesmo com erro zero
  level?: 'critical' | 'warning' | 'info';
}

interface ErrorBoundaryProState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  timestamp: number | null;
}

/**
 * ErrorBoundary Pro: Captura erros React com logging e recuperação automática
 */
export class ErrorBoundaryPro extends Component<ErrorBoundaryProProps, ErrorBoundaryProState> {
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      timestamp: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryProState> {
    const msg = String(error.message ?? '');

    // Ignora erros "fake" do React (e.g., NotFoundError removeChild)
    if (error.name === 'NotFoundError' && msg.includes('removeChild')) {
      return {};
    }

    return {
      hasError: true,
      error,
      timestamp: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    const level = this.props.level || 'critical';
    const requestId = (error as Partial<AppError>).requestId || undefined;

    // Log estruturado
    frontendLogger.error({
      message: `ErrorBoundary ${level} captured`,
      error,
      componentStack: errorInfo.componentStack ?? undefined,
      requestId,
      context: {
        retryCount: this.state.retryCount,
        timestamp: this.state.timestamp,
      },
    });

    // Callback customizado
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Sentry
    try {
      const sentryLevel = level === 'critical' ? 'error' : level;
      Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
        level: sentryLevel,
      });
    } catch (_) {
      // Sentry não disponível
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  handleRetry = () => {
    const { retryCount } = this.state;

    if (retryCount >= 3) {
      frontendLogger.warn({
        message: 'ErrorBoundary: Max retry attempts reached',
        context: { retryCount },
      });
      return;
    }

    frontendLogger.info({
      message: 'ErrorBoundary: Attempting retry',
      context: { retryCount: retryCount + 1 },
    });

    // Limpar estado e tentar novamente
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: retryCount + 1,
    });
  };

  handleReload = () => {
    frontendLogger.info({
      message: 'ErrorBoundary: User initiated page reload',
    });
    window.location.reload();
  };

  handleNavigate = (path: string) => {
    frontendLogger.info({
      message: 'ErrorBoundary: User navigated away',
      context: { destination: path },
    });
    window.location.href = path;
  };

  renderErrorUI() {
    const { error, errorInfo, retryCount } = this.state;

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isDevelopment = process.env.NODE_ENV === 'development';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-2xl border border-slate-700">
          {/* Header */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-red-300 text-sm font-semibold">Erro de Aplicação</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Oops! Algo deu errado</h1>
            <p className="text-slate-300">
              Tentamos recuperar, mas o aplicativo encontrou um erro inesperado.
            </p>
          </div>

          {/* Error Details */}
          {isDevelopment && error && (
            <div className="mb-6 p-4 bg-slate-900 rounded-lg border border-slate-700">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Detalhes do Erro:</h2>
              <div className="space-y-2">
                <div className="text-xs font-mono text-red-400">
                  <strong>Tipo:</strong> {error.name}
                </div>
                <div className="text-xs font-mono text-slate-400 max-h-32 overflow-auto">
                  <strong>Mensagem:</strong> {error.message}
                </div>
                {errorInfo && (
                  <div className="text-xs font-mono text-slate-400 max-h-32 overflow-auto">
                    <strong>Stack:</strong>
                    <pre className="mt-1 text-[10px]">{errorInfo.componentStack}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Retry Info */}
          <div className="mb-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <p className="text-blue-300 text-sm">
              {retryCount === 0
                ? 'Você pode tentar recuperar o aplicativo:'
                : `Tentativa ${retryCount} de ${3}. ${retryCount >= 3 ? 'Máximo de tentativas atingido.' : ''}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {retryCount < 3 && (
              <button
                onClick={this.handleRetry}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                🔄 Tentar Recuperar
              </button>
            )}
            <button
              onClick={this.handleReload}
              className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              🔁 Recarregar Página
            </button>
            <button
              onClick={() => this.handleNavigate('/dashboard')}
              className="w-full px-4 py-3 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg transition-colors"
            >
              🏠 Voltar ao Dashboard
            </button>
          </div>

          {/* Support Info */}
          <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <p className="text-xs text-slate-400">
              Se o problema persistir, entre em contato com o suporte. Referência de erro registrada no log da aplicação.
            </p>
          </div>
        </div>
      </div>
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderErrorUI();
    }

    return this.props.children;
  }
}

// Export como HOC também
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  boundaryProps?: Omit<ErrorBoundaryProProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundaryPro {...boundaryProps}>
        <Component {...props} />
      </ErrorBoundaryPro>
    );
  };
}

export default ErrorBoundaryPro;
