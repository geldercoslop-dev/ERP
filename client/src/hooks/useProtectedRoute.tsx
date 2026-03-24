/**
 * useProtectedRoute - Hook para proteção de rotas com verificação de auth/role
 * 
 * Features:
 * - Verificação de autenticação
 * - Verificação de role/permissões
 * - Logging de acesso
 * - Type-safe
 */

import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { frontendLogger } from '@/monitoring/frontend-logger';
import { useAuthStore } from '@/store/authStore';

interface ProtectionOptions {
  requireAuth?: boolean;
  allowedRoles?: string[];
  redirectTo?: string;
  onForbidden?: () => void;
}

interface UseProtectedRouteReturn {
  isAuthorized: boolean;
  isLoading: boolean;
}

/**
 * Verificar se usuário tem role
 */
function hasRequiredRole(userRoles?: string[], allowedRoles?: string[]): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!userRoles || userRoles.length === 0) return false;
  return allowedRoles.some((role) => userRoles.includes(role));
}

/**
 * Hook para proteger rota
 */
export function useProtectedRoute(options: ProtectionOptions = {}): UseProtectedRouteReturn {
  const [, setLocation] = useLocation();
  const {
    requireAuth = true,
    allowedRoles,
    redirectTo = '/login',
    onForbidden,
  } = options;

  const { userOrNull, isLoading } = useAuthStore();
  const userRoles = userOrNull?.role ? [userOrNull.role] : undefined;

  useEffect(() => {
    if (isLoading) return;

    // Verificar autenticação
    if (requireAuth && !userOrNull) {
      frontendLogger.warn({
        message: 'Unauthorized access attempt (not authenticated)',
        context: { route: window.location.pathname },
      });

      setLocation(redirectTo);
      return;
    }

    // Verificar permissões
    if (allowedRoles && userOrNull && !hasRequiredRole(userRoles, allowedRoles)) {
      frontendLogger.warn({
        message: 'Forbidden access attempt (insufficient permissions)',
        context: {
          route: window.location.pathname,
          userRoles,
          allowedRoles,
        },
      });

      if (onForbidden) {
        onForbidden();
      }

      setLocation('/dashboard');
      return;
    }

    // Log de acesso bem-sucedido
    if (userOrNull) {
      frontendLogger.logCriticalAction({
        action: 'route_access',
        status: 'success',
        context: {
          route: window.location.pathname,
          user: userOrNull.id,
          roles: userRoles,
        },
      });
    }
  }, [userOrNull, userRoles, isLoading, requireAuth, allowedRoles, redirectTo, setLocation, onForbidden]);

  return {
    isAuthorized: !requireAuth || (userOrNull !== null && hasRequiredRole(userRoles, allowedRoles)),
    isLoading,
  };
}

/**
 * HOC para proteger componente
 */
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options?: ProtectionOptions
) {
  return function ProtectedComponent(props: P) {
    const { isAuthorized, isLoading } = useProtectedRoute(options);

    if (isLoading) {
      return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
    }

    if (!isAuthorized) {
      return null;
    }

    return <Component {...props} />;
  };
}

export default useProtectedRoute;
