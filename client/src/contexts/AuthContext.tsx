/**
 * Contexto de Autenticação
 * Provedor global para autenticação (tRPC via auth.service)
 */

import React, { createContext, ReactNode, useCallback, useEffect, useState } from "react";
import type { AuthUser } from "../hooks/useAuthIntegration";
import * as authService from "../services/auth.service";
import { setSessionToken } from "../lib/security/sessionToken";

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

function mapUserInfo(u: authService.UserInfo): AuthUser {
  return {
    id: typeof u.id === "number" ? u.id : Number(u.id) || 0,
    name: u.name,
    role: u.role === "admin" ? "admin" : "vendedor",
    openId: u.openId ?? "",
    email: u.email,
  };
}

/**
 * Provedor de Autenticação
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const data = await authService.getCurrentUser();
      if (data) {
        setUser(mapUserInfo(data));
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Erro ao verificar sessão:", err);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await checkSession();
      setIsLoading(false);
    };
    void init();
  }, [checkSession]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.login({ username, password });

      if (response.ok && response.sessionToken) {
        setSessionToken(response.sessionToken);
        const me = await authService.getCurrentUser();
        if (me) {
          setUser(mapUserInfo(me));
          return true;
        }
        setError("Sessão criada mas usuário não retornado");
        return false;
      }
      setError(response.error || "Falha na autenticação");
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao fazer login";
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);

    try {
      await authService.logout();
      authService.clearStoredToken();
      setUser(null);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao fazer logout";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    error,
    login,
    logout,
    checkSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook para usar contexto de autenticação
 */
export function useAuthContext() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext deve ser usado dentro de AuthProvider");
  }
  return context;
}
