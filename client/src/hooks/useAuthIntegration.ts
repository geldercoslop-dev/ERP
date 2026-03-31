/**
 * Hook para Autenticação
 * Gerencia login, logout e estado de autenticação (tRPC via auth.service)
 */

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import * as authService from "../services/auth.service";

export interface AuthUser {
  id: number;
  openId: string;
  name: string;
  email?: string;
  role: "admin" | "vendedor";
  loginMethod?: string;
  vendedorId?: number;
  isImpersonating?: boolean;
  vendedorNome?: string;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

function mapUser(u: authService.UserInfo): AuthUser {
  return {
    id: typeof u.id === "number" ? u.id : Number(u.id) || 0,
    openId: u.openId ?? "",
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? "admin" : "vendedor",
  };
}

/**
 * Hook para gerenciar autenticação
 */
export function useAuthIntegration() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const checkSession = useCallback(async () => {
    try {
      const data = await authService.getCurrentUser();
      if (data) {
        setState({
          user: mapUser(data),
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
      } else {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao verificar sessão";
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: message,
      });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const login = useCallback(async (username: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await authService.login({ username, password });

      if (response.ok && response.sessionToken) {
        setSessionToken(response.sessionToken);
        const me = await authService.getCurrentUser();
        if (me) {
          const user: AuthUser = mapUser(me);
          setState({
            user,
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
          toast.success("Login realizado com sucesso!");
          return true;
        }
        throw new Error("Não foi possível carregar o usuário após o login");
      }
      throw new Error(response.error || "Falha no login");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao fazer login";
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: message,
      });
      toast.error(`Erro: ${message}`);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await authService.logout();
      authService.clearStoredToken();
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });
      toast.success("Logout realizado!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao fazer logout";
      toast.error(`Erro: ${message}`);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, []);

  return {
    ...state,
    login,
    logout,
    checkSession,
  };
}
