import React from 'react';
import { AlertCircle, RefreshCw, WifiOff, ServerCrash } from 'lucide-react';
import { ApiResponse, ApiError } from '@/lib/api/fetchWithHandling';
import { SkeletonLoader } from '@/components/LoadingStates';

interface ApiStateHandlerProps<T> {
  apiResponse: ApiResponse<T> | null;
  isLoading: boolean;
  children: (data: T) => React.ReactNode;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  onRetry?: () => void;
  customErrorMessages?: Record<string, string>;
}

export function ApiStateHandler<T>({
  apiResponse,
  isLoading,
  children,
  loadingComponent,
  errorComponent,
  onRetry,
  customErrorMessages = {}
}: ApiStateHandlerProps<T>) {
  // Loading state
  if (isLoading) {
    return (
      <>
        {loadingComponent || (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="w-full max-w-sm mb-4">
              <SkeletonLoader lines={3} />
            </div>
            <p className="text-gray-600">Carregando...</p>
          </div>
        )}
      </>
    );
  }

  // Error state
  if (apiResponse?.error) {
    if (errorComponent) {
      return <>{errorComponent}</>;
    }

    return <ErrorDisplay error={apiResponse.error} onRetry={onRetry} customMessages={customErrorMessages} />;
  }

  // Success state
  if (apiResponse?.data) {
    return <>{children(apiResponse.data)}</>;
  }

  // Empty state
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
      <p className="text-gray-600">Nenhum dado encontrado</p>
    </div>
  );
}

interface ErrorDisplayProps {
  error: ApiError;
  onRetry?: () => void;
  customMessages: Record<string, string>;
}

function ErrorDisplay({ error, onRetry, customMessages }: ErrorDisplayProps) {
  const getErrorMessage = () => {
    if (customMessages[error.code || '']) {
      return customMessages[error.code!];
    }
    return error.message;
  };

  const getErrorIcon = () => {
    if (error.isNetworkError || error.isTimeout) {
      return <WifiOff className="h-12 w-12 text-red-500" />;
    }
    if (error.status >= 500) {
      return <ServerCrash className="h-12 w-12 text-red-500" />;
    }
    return <AlertCircle className="h-12 w-12 text-red-500" />;
  };

  const showRetry = onRetry && (error.isNetworkError || error.status >= 500 || error.code === 'RATE_LIMIT');

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
      {getErrorIcon()}
      
      <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2">
        Ocorreu um erro
      </h3>
      
      <p className="text-gray-600 mb-6">
        {getErrorMessage()}
      </p>

      {error.code && (
        <div className="text-xs text-gray-500 mb-4">
          Código: {error.code}
        </div>
      )}

      {error.requestId && (
        <div className="text-xs text-gray-500 mb-4">
          RequestId: {error.requestId}
        </div>
      )}

      {showRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </button>
      )}

      {error.isNetworkError && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>Dica:</strong> Verifique sua conexão com a internet e tente novamente.
          </p>
        </div>
      )}
    </div>
  );
}

// Hook para facilitar o uso
export function useApiState<T>(
  apiCall: () => Promise<ApiResponse<T>>,
  dependencies: React.DependencyList = []
) {
  const [state, setState] = React.useState<{
    data: T | null;
    isLoading: boolean;
    error: ApiError | null;
  }>({
    data: null,
    isLoading: true,
    error: null
  });

  const execute = React.useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiCall();
      
      if (response.ok && response.data) {
        setState({
          data: response.data,
          isLoading: false,
          error: null
        });
      } else {
        setState({
          data: null,
          isLoading: false,
          error: response.error || null
        });
      }
    } catch (err) {
      console.error('[FRONT ERROR] useApiState exception:', err);
      setState({
        data: null,
        isLoading: false,
        error: {
          status: 0,
          message: 'Unexpected error occurred',
          code: 'UNEXPECTED_ERROR',
          isNetworkError: true
        }
      });
    }
  }, dependencies);

  React.useEffect(() => {
    execute();
  }, [execute]);

  return {
    ...state,
    execute,
    retry: execute,
    apiResponse: state.error ? { error: state.error, ok: false, status: state.error.status } : 
                 state.data ? { data: state.data, ok: true, status: 200 } : null
  };
}
