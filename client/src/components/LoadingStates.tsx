import React, { useEffect, useState } from 'react';

interface ResilientLoadingProps {
  timeout?: number;
  onTimeout?: () => void;
  fallback?: React.ReactNode;
  children: React.ReactNode;
  minDisplayTime?: number;
  showRetryAfter?: number;
}

interface LoadingState {
  isLoading: boolean;
  hasTimedOut: boolean;
  showRetry: boolean;
  startTime: number;
}

/**
 * Componente de loading resiliente com timeout e retry
 */
export function ResilientLoading({
  timeout = 10000, // 10 segundos padrão
  onTimeout,
  fallback,
  children,
  minDisplayTime = 500, // Mínimo 500ms para evitar flicker
  showRetryAfter = 5000 // Mostrar retry após 5 segundos
}: ResilientLoadingProps) {
  const [state, setState] = useState<LoadingState>({
    isLoading: true,
    hasTimedOut: false,
    showRetry: false,
    startTime: Date.now()
  });

  useEffect(() => {
    const startTime = Date.now();
    
    // Timer para timeout
    const timeoutTimer = setTimeout(() => {
      setState(prev => ({
        ...prev,
        hasTimedOut: true,
        isLoading: false
      }));
      
      if (onTimeout) {
        onTimeout();
      }
    }, timeout);

    // Timer para mostrar retry
    const retryTimer = setTimeout(() => {
      setState(prev => ({
        ...prev,
        showRetry: true
      }));
    }, showRetryAfter);

    // Timer para tempo mínimo de exibição
    const minDisplayTimer = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= minDisplayTime) {
        setState(prev => ({
          ...prev,
          isLoading: false
        }));
      }
    }, minDisplayTime);

    return () => {
      clearTimeout(timeoutTimer);
      clearTimeout(retryTimer);
      clearTimeout(minDisplayTimer);
    };
  }, [timeout, onTimeout, minDisplayTime, showRetryAfter]);

  const handleRetry = () => {
    setState({
      isLoading: true,
      hasTimedOut: false,
      showRetry: false,
      startTime: Date.now()
    });
  };

  if (state.hasTimedOut) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '16px'
        }}>
          ⏱️ Está demorando mais que o esperado...
        </div>
        
        {state.showRetry && (
          <button
            onClick={handleRetry}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (state.isLoading) {
    return <>{children}</>;
  }

  return <>{children}</>;
}

/**
 * Spinner de loading com mensagem
 */
export function LoadingSpinner({ 
  message = 'Carregando...', 
  size = 'medium',
  showProgress = false 
}: {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
}) {
  const sizeMap = {
    small: 20,
    medium: 32,
    large: 48
  };

  const spinnerSize = sizeMap[size];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      {/* Spinner */}
      <div
        style={{
          width: `${spinnerSize}px`,
          height: `${spinnerSize}px`,
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '12px'
        }}
      />
      
      {/* Mensagem */}
      <div style={{
        fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px',
        color: '#6b7280',
        textAlign: 'center'
      }}>
        {message}
      </div>

      {/* Progress bar opcional */}
      {showProgress && (
        <div style={{
          width: '200px',
          height: '4px',
          backgroundColor: '#e5e7eb',
          borderRadius: '2px',
          marginTop: '12px',
          overflow: 'hidden'
        }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#3b82f6',
              animation: 'progress 2s ease-in-out infinite'
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton loader para conteúdo
 */
export function SkeletonLoader({ 
  lines = 3, 
  width = '100%', 
  height = '16px' 
}: {
  lines?: number;
  width?: string;
  height?: string;
}) {
  return (
    <div style={{ width }}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          style={{
            height,
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            marginBottom: index < lines - 1 ? '8px' : '0',
            animation: 'pulse 1.5s ease-in-out infinite',
            width: index === lines - 1 ? '60%' : width
          }}
        />
      ))}
    </div>
  );
}

/**
 * Card skeleton para listas
 */
export function CardSkeletonLoader() {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
      backgroundColor: '#ffffff'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: '#e5e7eb',
            borderRadius: '50%',
            marginRight: '12px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: '16px',
              backgroundColor: '#e5e7eb',
              borderRadius: '4px',
              marginBottom: '6px',
              width: '60%',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}
          />
          <div
            style={{
              height: '12px',
              backgroundColor: '#e5e7eb',
              borderRadius: '4px',
              width: '40%',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}
          />
        </div>
      </div>
      
      {/* Content */}
      <SkeletonLoader lines={2} height="14px" />
    </div>
  );
}

/**
 * Table skeleton para tabelas
 */
export function TableSkeletonLoader({ 
  rows = 5, 
  columns = 4 
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {/* Header */}
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, index) => (
              <th
                key={index}
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  borderBottom: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb'
                }}
              >
                <div
                  style={{
                    height: '16px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    width: '80%'
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        
        {/* Body */}
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td
                  key={colIndex}
                  style={{
                    padding: '12px',
                    borderBottom: '1px solid #e5e7eb'
                  }}
                >
                  <div
                    style={{
                      height: '14px',
                      backgroundColor: '#e5e7eb',
                      borderRadius: '4px',
                      animation: 'pulse 1.5s ease-in-out infinite',
                      width: colIndex === 0 ? '60%' : '40%'
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Hook para loading resiliente
 */
export function useResilientLoading(
  asyncOperation: () => Promise<any>,
  options: {
    timeout?: number;
    retryCount?: number;
    onTimeout?: () => void;
    onError?: (error: any) => void;
  } = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<any>(null);

  const execute = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await Promise.race([
        asyncOperation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), options.timeout || 10000)
        )
      ]);

      setData(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      if (options.onError) {
        options.onError(error);
      }
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const retry = async () => {
    await execute();
  };

  return {
    isLoading,
    error,
    data,
    execute,
    retry
  };
}

/**
 * Componente de loading para páginas inteiras
 */
export function PageLoading({ message = 'Carregando página...' }: { message?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        textAlign: 'center'
      }}>
        {/* Logo ou ícone */}
        <div style={{
          width: '64px',
          height: '64px',
          backgroundColor: '#3b82f6',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          <span style={{ fontSize: '32px', color: 'white' }}>📦</span>
        </div>
        
        <LoadingSpinner message={message} size="large" showProgress={true} />
        
        <div style={{
          marginTop: '24px',
          fontSize: '12px',
          color: '#9ca3af'
        }}>
          ERP GRS Móveis
        </div>
      </div>
    </div>
  );
}

/**
 * Componente de loading inline para botões e ações
 */
export function InlineLoading({ size = 'small' }: { size?: 'small' | 'medium' }) {
  const sizeMap = {
    small: 16,
    medium: 20
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <div
        style={{
          width: `${sizeMap[size]}px`,
          height: `${sizeMap[size]}px`,
          border: '2px solid #e5e7eb',
          borderTop: '2px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}
      />
      <span style={{ fontSize: size === 'small' ? '12px' : '14px', color: '#6b7280' }}>
        Carregando...
      </span>
    </div>
  );
}

// Adicionar estilos CSS para animações
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  @keyframes progress {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

if (!document.head.querySelector('style[data-loading-animations]')) {
  style.setAttribute('data-loading-animations', 'true');
  document.head.appendChild(style);
}
