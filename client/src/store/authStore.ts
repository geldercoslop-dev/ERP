// Versão simplificada do authStore.ts sem zustand
// Para uso temporário até que o zustand seja instalado corretamente

import { trpc, getSessionToken, setSessionToken } from '@/lib/trpcClient';
import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';

// Tipos
export type UserRole = 'admin' | 'vendedor';

export interface User {
  id: number;
  openId: string;
  name: string;
  email?: string | null;
  role: UserRole;
}

/** Usuário placeholder para nunca acessar .name em undefined. */
const DEFAULT_USER: User = {
  id: 0,
  openId: "",
  name: "Usuário",
  role: "vendedor",
};


function getTrpcBaseUrl(): string {
  // No navegador: sempre relativo para a mesma origem (cookie acompanha em login e auth.me).
  if (typeof window !== "undefined") return "/api/trpc";
  const raw = (import.meta as any)?.env?.VITE_TRPC_URL as string | undefined;
  const url = (raw ?? "").trim().replace(/\/+$/, "");
  return url || "/api/trpc";
}

function hasForceLogout(): boolean {
  try {
    return sessionStorage.getItem("grs-force-logout") === "1";
  } catch {
    return false;
  }
}

function setForceLogout(v: boolean) {
  try {
    if (v) sessionStorage.setItem("grs-force-logout", "1");
    else sessionStorage.removeItem("grs-force-logout");
  } catch {}
}

// Estado global simplificado
let globalUser: User | null = null;
let globalIsLoading = true; // true inicial: evita redirect antes do primeiro auth.me (evita loop)
let globalIsAuthenticated = false;
let listeners: Function[] = [];

// NÃO restaurar "logado" do localStorage: a sessão real é o cookie no servidor.
// Se restaurarmos só do localStorage, a UI mostra "logado" mas as requisições vão sem cookie (hasCookie: false).
// Deixamos loading true até checkAuth() validar com auth.me (que exige cookie).
globalUser = null;
globalIsAuthenticated = false;
// globalIsLoading continua true até checkAuth rodar

// Função para notificar os ouvintes
function notifyListeners() {
  listeners.forEach(listener => listener());
}

// Funções de gerenciamento de estado
function setUser(user: User | null) {
  globalUser = user;
  globalIsAuthenticated = !!user;
  
  if (user) {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify({
        openId: user.openId ?? "",
        name: user.name ?? "Usuário",
        role: user.role ?? "vendedor",
      })
    );
    
    // Salvar no localStorage
    localStorage.setItem('manus-auth-store', JSON.stringify({
      state: {
        user,
        isAuthenticated: true
      }
    }));
  } else {
    localStorage.removeItem("manus-runtime-user-info");
    localStorage.removeItem('manus-auth-store');
  }
  
  notifyListeners();
}

async function trpcBatchCall(path: string, input: unknown) {
  const baseUrl = getTrpcBaseUrl();
  const token = getSessionToken();
  const sessionHeader = token
    ? { "X-Session-Token": token, Authorization: `Bearer ${token}` }
    : {};
  // auth.me é uma query: usar GET para evitar 405 Method Not Allowed no servidor
  if (path === "auth.me") {
    const inputStr = encodeURIComponent(JSON.stringify(input ?? {}));
    const res = await fetch(`${baseUrl}/auth.me?input=${inputStr}`, {
      method: "GET",
      credentials: "include",
      headers: sessionHeader,
    });
    if (!res.ok) {
      if (res.status === 401) return null;
      throw new Error(`auth.me: ${res.status}`);
    }
    const result = await res.json();
    const data = result?.result?.data?.json ?? result?.result?.data ?? result?.result;
    return data ?? null;
  }
  // Mutations (login, logout): POST em batch
  const batchBody = typeof input === "object" && input !== null ? { 0: input } : { 0: {} };
  const response = await fetch(`${baseUrl}/${path}?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeader },
    body: JSON.stringify(batchBody),
    credentials: "include",
  });

  const result = await response.json();
  const payload = Array.isArray(result) ? result[0] : result;
  if (payload?.error) {
    throw new Error(payload.error?.message || "Erro na requisição");
  }
  return payload?.result?.data?.json ?? payload?.result?.data ?? payload?.result ?? null;
}

async function login(username: string, password: string) {
  globalIsLoading = true;
  notifyListeners();
  
  try {
    const data = await trpcBatchCall("auth.login", {
      username: username.trim(),
      password: password.trim(),
    });
    
    if (data?.ok) {
      const token = data.sessionToken;
      if (typeof token === "string" && token) {
        setSessionToken(token);
        localStorage.setItem("grs-session-token", token);
      }
      const normalizeRole = (raw: unknown): UserRole => {
        const s = String(raw ?? "").trim().toLowerCase();
        if (!s) return "vendedor";
        if (s === "admin" || s.includes("admin")) return "admin";
        if (s === "vendedor" || s.includes("vend")) return "vendedor";
        return "vendedor";
      };

      const user = {
        id: -1,
        openId: data.openId ?? "",
        name: data.name ?? "Usuário",
        role: normalizeRole(data.role),
      };
      
      globalUser = user;
      globalIsAuthenticated = true;
      globalIsLoading = false;
    // login manual remove bloqueio
    setForceLogout(false);
      
      // Salvar no localStorage
      localStorage.setItem('manus-auth-store', JSON.stringify({
        state: {
          user,
          isAuthenticated: true
        }
      }));
      
      notifyListeners();

      // Validar que o cookie foi aceito: próxima requisição (auth.me) deve enviá-lo
      checkAuth().then(() => notifyListeners());

      return true;
    }
    throw new Error("Usuário ou senha inválidos");
  } catch (error) {
    globalIsLoading = false;
    notifyListeners();
    
    // Mostrar mensagem de erro
    const errorMessage = error instanceof Error 
      ? error.message 
      : "Erro ao fazer login. Tente novamente.";
    
    toast.error(errorMessage);
    throw error instanceof Error ? error : new Error(errorMessage);
  }
}

async function logout() {
  globalIsLoading = true;
  notifyListeners();

  try {
    // chama backend para invalidar sessão/cookie
    await trpcBatchCall("auth.logout", {});
  } catch (e) {
    // mesmo se falhar, seguimos com logout local
    console.warn("[authStore] logout remoto falhou:", e);
  }

  // Bloqueia reauth automático (evita "pisca e volta")
  setForceLogout(true);

  // Limpar dados do usuário (não apagar storage inteiro do navegador)
  globalUser = null;
  globalIsAuthenticated = false;
  globalIsLoading = false;

  try {
    setSessionToken(null);
    localStorage.removeItem("manus-runtime-user-info");
    localStorage.removeItem("manus-auth-store");
  } catch {}

  notifyListeners();
  toast.info("Sessão encerrada");
}

async function checkAuth() {
  // Não reautenticar na tela de login ou após logout forçado
  if (typeof window !== "undefined") {
    const isLogin = window.location.pathname.startsWith("/login");
    if (isLogin) return false;
    if (hasForceLogout()) return false;
  }

  // Sempre verificar com o servidor para garantir estado atualizado
  globalIsLoading = true;
  notifyListeners();
  
  try {
    // Usar o mesmo formato de batch que o tRPC para garantir que o cookie seja enviado e a rota aceita
    const userData = await trpcBatchCall("auth.me", null);
    
    if (userData) {
      const normalizeRole = (raw: unknown): UserRole => {
        const s = String(raw ?? "").trim().toLowerCase();
        if (!s) return "vendedor";
        if (s === "admin" || s.includes("admin")) return "admin";
        if (s === "vendedor" || s.includes("vend")) return "vendedor";
        return "vendedor";
      };

      const user = {
        id: userData.id ?? -1,
        openId: userData.openId ?? "",
        name: userData.name ?? "Usuário",
        email: userData.email ?? null,
        role: normalizeRole(userData.role),
      };
      
      globalUser = user;
      globalIsAuthenticated = true;
      globalIsLoading = false;
      
      // Salvar no localStorage
      localStorage.setItem('manus-auth-store', JSON.stringify({
        state: {
          user,
          isAuthenticated: true
        }
      }));
      
      notifyListeners();
      
      return true;
    } else {
      // Usuário não autenticado
      globalUser = null;
      globalIsAuthenticated = false;
      globalIsLoading = false;
      
      localStorage.removeItem('manus-auth-store');
      
      notifyListeners();
      
      return false;
    }
  } catch (error) {
    // Em caso de erro, considerar não autenticado
    globalUser = null;
    globalIsAuthenticated = false;
    globalIsLoading = false;
    
    localStorage.removeItem('manus-auth-store');
    
    notifyListeners();
    
    return false;
  }
}

// Hook para usar o estado de autenticação
export function useAuthStore() {
  const [user, setUserState] = useState(globalUser);
  const [isLoading, setIsLoading] = useState(globalIsLoading);
  const [isAuthenticated, setIsAuthenticated] = useState(globalIsAuthenticated);
  
  useEffect(() => {
    // Função para atualizar o estado local
    function handleChange() {
      setUserState(globalUser);
      setIsLoading(globalIsLoading);
      setIsAuthenticated(globalIsAuthenticated);
    }
    
    // Adicionar ouvinte
    listeners.push(handleChange);
    
    // Remover ouvinte ao desmontar
    return () => {
      listeners = listeners.filter(listener => listener !== handleChange);
    };
  }, []);
  
  const setUserCallback = useCallback((newUser: User | null) => {
    setUser(newUser);
  }, []);
  
  const loginCallback = useCallback(async (username: string, password: string) => {
    return await login(username, password);
  }, []);
  
  const logoutCallback = useCallback(async () => {
    await logout();
  }, []);
  
  const checkAuthCallback = useCallback(async () => {
    return await checkAuth();
  }, []);
  
  // Nunca expor null/undefined: sempre retornar objeto com name/role para evitar "reading 'name' of undefined".
  const safeUser = user ?? DEFAULT_USER;

  return {
    user: safeUser,
    userOrNull: user,
    isLoading,
    isAuthenticated,
    setUser: setUserCallback,
    login: loginCallback,
    logout: logoutCallback,
    checkAuth: checkAuthCallback,
  };
}

// Hook para verificar autenticação no carregamento da aplicação
export function useAuthInitializer() {
  useEffect(() => {
    checkAuth();
  }, []);
}
