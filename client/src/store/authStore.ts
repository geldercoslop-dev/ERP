// Versão simplificada do authStore.ts sem zustand
// Para uso temporário até que o zustand seja instalado corretamente

import { setSessionToken } from '../lib/security/sessionToken';
import { trpcCall } from '../lib/trpcClient';
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

/** Forma esperada do retorno de auth.me (backend já envia isImpersonating, vendedorNome, vendedorId). */
interface AuthMeResponse {
  id?: number;
  openId?: string;
  name?: string;
  email?: string | null;
  role?: string;
  isImpersonating?: boolean;
  vendedorNome?: string | null;
  vendedorId?: number | null;
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

/** Chamado após 401 na API: evita estado “logado” na UI sem sessão válida. */
export function invalidateSessionAfter401(): void {
  setForceLogout(true);
  try {
    setSessionToken(null);
    localStorage.removeItem("manus-runtime-user-info");
    localStorage.removeItem("manus-auth-store");
  } catch {
    /* ignore */
  }
  globalUser = null;
  globalIsAuthenticated = false;
  globalIsLoading = false;
  globalIsImpersonating = false;
  globalVendedorNome = null;
  globalVendedorId = null;
  notifyListeners();
}

/** Chave sessionStorage: login só conta se passou pelo formulário nesta aba (evita auto-login por cookie). */
const LOGIN_CONFIRMED_KEY = "grs-login-confirmed";

function setLoginConfirmadoNestaSessao(value: boolean) {
  try {
    if (value) sessionStorage.setItem(LOGIN_CONFIRMED_KEY, "1");
    else sessionStorage.removeItem(LOGIN_CONFIRMED_KEY);
  } catch {}
}

function hasLoginConfirmadoNestaSessao(): boolean {
  try {
    return sessionStorage.getItem(LOGIN_CONFIRMED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Limpa o flag de login confirmado (usado no logout para garantir que ao reabrir exige login). */
export function clearLoginConfirmadoNestaSessao() {
  setLoginConfirmadoNestaSessao(false);
}

// Estado global simplificado
let globalUser: User | null = null;
let globalIsLoading = true; // true inicial: evita redirect antes do primeiro auth.me (evita loop)
let globalIsAuthenticated = false;
let globalIsImpersonating = false;
let globalVendedorNome: string | null = null;
let globalVendedorId: number | null = null;
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

async function login(username: string, password: string) {
  globalIsLoading = true;
  notifyListeners();
  
  try {
    const data = (await trpcCall("auth.login", {
      username: username.trim(),
      password: password.trim(),
    })) as {
      ok?: boolean;
      sessionToken?: string;
      openId?: string;
      name?: string;
      role?: string;
      id?: number;
    };
    
    if (data?.ok) {
      setLoginConfirmadoNestaSessao(true);
      const token = data.sessionToken;
      if (typeof token === "string" && token) {
        setSessionToken(token);
      }
      const normalizeRole = (raw: unknown): UserRole => {
        const s = String(raw ?? "").trim().toLowerCase();
        if (!s) return "vendedor";
        if (s === "admin" || s.includes("admin")) return "admin";
        if (s === "vendedor" || s.includes("vend")) return "vendedor";
        return "vendedor";
      };

      const user = {
        id: data.id ?? 0,
        openId: data.openId ?? "",
        name: data.name ?? "Usuário",
        role: normalizeRole(data.role),
      };
      
      globalUser = user;
      globalIsAuthenticated = true;
      globalIsLoading = false;
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
    await trpcCall("auth.logout", null);
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
  globalIsImpersonating = false;
  globalVendedorNome = null;
  globalVendedorId = null;

  try {
    setLoginConfirmadoNestaSessao(false);
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
    const userData = await trpcCall("auth.me", null);
    const confirmed = hasLoginConfirmadoNestaSessao();

    if (userData && confirmed) {
      const me = userData as AuthMeResponse;
      const normalizeRole = (raw: unknown): UserRole => {
        const s = String(raw ?? "").trim().toLowerCase();
        if (!s) return "vendedor";
        if (s === "admin" || s.includes("admin")) return "admin";
        if (s === "vendedor" || s.includes("vend")) return "vendedor";
        return "vendedor";
      };

      const user = {
        id: me.id ?? -1,
        openId: me.openId ?? "",
        name: me.name ?? "Usuário",
        email: me.email ?? null,
        role: normalizeRole(me.role),
      };
      
      globalUser = user;
      globalIsAuthenticated = true;
      globalIsLoading = false;
      globalIsImpersonating = Boolean(me.isImpersonating);
      globalVendedorNome = typeof me.vendedorNome === "string" ? me.vendedorNome : null;
      globalVendedorId = typeof me.vendedorId === "number" ? me.vendedorId : null;
      localStorage.setItem('manus-auth-store', JSON.stringify({
        state: { user, isAuthenticated: true }
      }));
      notifyListeners();
      return true;
    } else {
      globalUser = null;
      globalIsAuthenticated = false;
      globalIsLoading = false;
      globalIsImpersonating = false;
      globalVendedorNome = null;
      globalVendedorId = null;
      if (!confirmed) setLoginConfirmadoNestaSessao(false);
      localStorage.removeItem('manus-auth-store');
      notifyListeners();
      return false;
    }
  } catch (error) {
    globalUser = null;
    globalIsAuthenticated = false;
    globalIsLoading = false;
    globalIsImpersonating = false;
    globalVendedorNome = null;
    globalVendedorId = null;
    setLoginConfirmadoNestaSessao(false);
    localStorage.removeItem('manus-auth-store');
    notifyListeners();
    return false;
  }
}

/**
 * Para o modo impersonation: chama backend, atualiza estado e redireciona.
 * Sem recursão; não confundir com estado isImpersonating (variável global).
 */
async function doStopImpersonation(): Promise<void> {
  try {
    await trpcCall("auth.stopImpersonation", null);
    toast.success("Voltou ao painel de administrador.");
    await checkAuth();
    window.location.href = "/dashboard";
  } catch (e) {
    console.warn("[authStore] doStopImpersonation falhou:", e);
    toast.error(e instanceof Error ? e.message : "Erro ao voltar ao admin.");
  }
}

// Hook para usar o estado de autenticação
export function useAuthStore() {
  const [user, setUserState] = useState(globalUser);
  const [isLoading, setIsLoading] = useState(globalIsLoading);
  const [isAuthenticated, setIsAuthenticated] = useState(globalIsAuthenticated);
  
  const [isImpersonating, setIsImpersonating] = useState(globalIsImpersonating);
  const [vendedorNome, setVendedorNome] = useState(globalVendedorNome);
  const [vendedorId, setVendedorId] = useState(globalVendedorId);

  useEffect(() => {
    // Função para atualizar o estado local
    function handleChange() {
      setUserState(globalUser);
      setIsLoading(globalIsLoading);
      setIsAuthenticated(globalIsAuthenticated);
      setIsImpersonating(globalIsImpersonating);
      setVendedorNome(globalVendedorNome);
      setVendedorId(globalVendedorId);
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

  const voltarAoAdminCallback = useCallback(async () => {
    return await doStopImpersonation();
  }, []);
  
  // Nunca expor null/undefined: sempre retornar objeto com name/role para evitar "reading 'name' of undefined".
  const safeUser = user ?? DEFAULT_USER;

  return {
    user: safeUser,
    userOrNull: user,
    isLoading,
    isAuthenticated,
    isImpersonating,
    vendedorNome: vendedorNome ?? undefined,
    vendedorId: vendedorId ?? undefined,
    setUser: setUserCallback,
    login: loginCallback,
    logout: logoutCallback,
    checkAuth: checkAuthCallback,
    voltarAoAdmin: voltarAoAdminCallback,
  };
}

// Hook para verificar autenticação no carregamento da aplicação
export function useAuthInitializer() {
  useEffect(() => {
    checkAuth();
  }, []);
}