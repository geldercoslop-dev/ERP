import React from 'react';
import { ErrorInfo } from 'react';

interface ErrorFallbackProps {
  error?: Error | null;
  errorInfo?: ErrorInfo | null;
  onRetry?: () => void;
  onReload?: () => void;
  onBackToLogin?: () => void;
  retryCount?: number;
  maxRetries?: number;
  variant?: 'full' | 'inline' | 'minimal';
  message?: string;
}

/**
 * Componente de fallback para erros
 * Fornece interface amigável para recuperação de erros
 */
export function ErrorFallback({
  error,
  errorInfo,
  onRetry,
  onReload,
  onBackToLogin,
  retryCount = 0,
  maxRetries = 3,
  variant = 'full',
  message = 'O sistema encontrou um erro inesperado.'
}: ErrorFallbackProps) {
  const canRetry = retryCount < maxRetries;

  if (variant === 'minimal') {
    return (
      <div style={{
        padding: 16,
        textAlign: 'center',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        backgroundColor: '#fef2f2'
      }}>
        <div style={{ fontSize: 14, color: '#dc2626', marginBottom: 8 }}>
          ⚠️ {message}
        </div>
        {onRetry && canRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div style={{
        padding: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        backgroundColor: '#fef2f2'
      }}>
        <div style={{
          width: 32,
          height: 32,
          backgroundColor: '#fee2e2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{ fontSize: 16, color: '#dc2626' }}>⚠️</span>
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937', marginBottom: 4 }}>
            {message}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Você pode tentar novamente ou recarregar a página.
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {onRetry && canRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              Tentar ({maxRetries - retryCount})
            </button>
          )}
          {onReload && (
            <button
              onClick={onReload}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              Recarregar
            </button>
          )}
        </div>
      </div>
    );
  }

  // Variant 'full' (padrão)
  return (
    <div style={{ 
      padding: 40, 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f8fafc'
    }}>
      <div style={{
        maxWidth: 500,
        width: '100%',
        textAlign: 'center',
        padding: 32,
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Ícone de erro */}
        <div style={{
          width: 64,
          height: 64,
          backgroundColor: '#fee2e2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <span style={{ fontSize: 32, color: '#dc2626' }}>⚠️</span>
        </div>

        <h1 style={{ 
          color: '#1f2937', 
          marginBottom: 12,
          fontSize: 24,
          fontWeight: 600,
          margin: '0 0 12px 0'
        }}>
          Ocorreu um erro
        </h1>
        
        <p style={{ 
          color: '#6b7280', 
          marginBottom: 32,
          lineHeight: 1.6,
          fontSize: 16
        }}>
          {message}
          <br />
          Por favor, tente novamente ou recarregue o sistema.
        </p>
        
        {/* Informações de retry */}
        {retryCount > 0 && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            padding: 12,
            marginBottom: 24
          }}>
            <div style={{ fontSize: 14, color: '#92400e', fontWeight: 500 }}>
              Tentativa {retryCount} de {maxRetries}
            </div>
            <div style={{ fontSize: 12, color: '#78350f', marginTop: 4 }}>
              Aguardando antes da próxima tentativa...
            </div>
          </div>
        )}
        
        {/* Botões de ação */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginBottom: 24
        }}>
          {onRetry && canRetry && (
            <button 
              onClick={onRetry}
              style={{
                padding: '14px 24px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#3b82f6';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              🔄 Tentar novamente ({maxRetries - retryCount} restantes)
            </button>
          )}
          
          <div style={{ display: 'flex', gap: 12 }}>
            {onReload && (
              <button 
                onClick={onReload}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b7280';
                }}
              >
                🔄 Recarregar sistema
              </button>
            )}
            
            {onBackToLogin && (
              <button 
                onClick={onBackToLogin}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.color = '#374151';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                🔐 Voltar ao login
              </button>
            )}
          </div>
        </div>
        
        {/* Informações de suporte */}
        <div style={{
          fontSize: 12,
          color: '#9ca3af',
          marginBottom: 16
        }}>
          Se o erro persistir, entre em contato com o suporte técnico.
        </div>
        
        {/* Detalhes técnicos em desenvolvimento */}
        {process.env.NODE_ENV === 'development' && error && (
          <details style={{ 
            textAlign: 'left',
            fontSize: 12,
            color: '#6b7280',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 16,
            backgroundColor: '#f9fafb'
          }}>
            <summary style={{ 
              cursor: 'pointer', 
              marginBottom: 12,
              fontWeight: 600,
              color: '#374151'
            }}>
              📋 Detalhes técnicos (desenvolvimento)
            </summary>
            
            <div style={{ marginBottom: 12 }}>
              <strong>Erro:</strong>
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                fontSize: 11,
                margin: '8px 0',
                padding: 8,
                backgroundColor: '#fee2e2',
                borderRadius: 4,
                color: '#dc2626'
              }}>
                {error.toString()}
              </pre>
            </div>
            
            {errorInfo?.componentStack && (
              <div style={{ marginBottom: 12 }}>
                <strong>Component Stack:</strong>
                <pre style={{ 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-word',
                  fontSize: 11,
                  margin: '8px 0',
                  padding: 8,
                  backgroundColor: '#f3f4f6',
                  borderRadius: 4,
                  color: '#6b7280',
                  maxHeight: 200,
                  overflow: 'auto'
                }}>
                  {errorInfo.componentStack}
                </pre>
              </div>
            )}
            
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              <strong>Tentativas:</strong> {retryCount}/{maxRetries}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Componente de fallback para erros de rede
 */
export function NetworkErrorFallback({ onRetry, onReload }: { onRetry?: () => void; onReload?: () => void }) {
  return (
    <ErrorFallback
      message="Não foi possível conectar ao servidor. Verifique sua conexão com a internet."
      variant="full"
      onRetry={onRetry}
      onReload={onReload}
    />
  );
}

/**
 * Componente de fallback para timeout
 */
export function TimeoutErrorFallback({ onRetry, onReload }: { onRetry?: () => void; onReload?: () => void }) {
  return (
    <ErrorFallback
      message="A operação demorou muito tempo para responder. Tente novamente."
      variant="full"
      onRetry={onRetry}
      onReload={onReload}
    />
  );
}

/**
 * Componente de fallback para erros de permissão
 */
export function PermissionErrorFallback({ onBackToLogin }: { onBackToLogin?: () => void }) {
  return (
    <ErrorFallback
      message="Você não tem permissão para acessar esta página."
      variant="full"
      onBackToLogin={onBackToLogin}
    />
  );
}

/**
 * Componente de fallback para página não encontrada
 */
export function NotFoundFallback({ onBackToLogin }: { onBackToLogin?: () => void }) {
  return (
    <ErrorFallback
      message="Página não encontrada. Verifique o endereço ou volte para a página inicial."
      variant="full"
      onBackToLogin={onBackToLogin}
    />
  );
}
