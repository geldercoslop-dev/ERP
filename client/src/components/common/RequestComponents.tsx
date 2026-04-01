/**
 * Componentes de UI para estados comuns
 */

import { ReactNode } from 'react';

export interface LoadingProps {
  children?: ReactNode;
}

export function Loading({ children }: LoadingProps) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      {children && <span className="ml-3">{children}</span>}
    </div>
  );
}

export interface ErrorProps {
  title?: string;
  message?: string;
  error?: Error | null;
  onRetry?: () => void;
}

export function ErrorDisplay({ title = 'Erro', message, error, onRetry }: ErrorProps) {
  const errorMessage = message || error?.message || 'Ocorreu um erro inesperado';

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm mt-1">{errorMessage}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Tentar Novamente
        </button>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title = 'Sem dados',
  message = 'Nenhum item encontrado',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
