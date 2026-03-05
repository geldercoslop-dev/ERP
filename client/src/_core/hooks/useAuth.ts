import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpcClient";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

type LocalUser = {
  openId: string;
  name: string;
  email?: string;
  role: "admin" | "vendedor";
};

const DEFAULT_USER: LocalUser = {
  openId: "",
  name: "Usuário",
  role: "vendedor",
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // FIX: meQuery SEMPRE ativo — localStorage é apenas estado inicial de render,
  // nunca desabilita a validação real da sessão no backend.
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // FIX: memoizar leitura do localStorage para não recriar a cada render
  const localUser = useMemo<LocalUser | null>(() => {
    try {
      const stored = localStorage.getItem("manus-runtime-user-info");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.openId) return parsed;
      }
    } catch {
      // localStorage corrompido — ignorar silenciosamente
    }
    return null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const stopImpersonationMutation = trpc.auth.stopImpersonation.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });

  const voltarAoAdmin = useCallback(async () => {
    try {
      await stopImpersonationMutation.mutateAsync();
      toast.success("Voltou para admin");
      if (typeof window !== "undefined") window.location.href = "/";
    } catch (e) {
      toast.error("Erro ao voltar ao admin");
    }
  }, [stopImpersonationMutation]);

  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem("grs-login-confirmed");
      localStorage.removeItem("manus-runtime-user-info");
      utils.auth.me.setData(undefined, null);
      document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost";
      document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (!(error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED")) {
        console.error("Erro no logout:", error);
      }
    } finally {
      await utils.auth.me.invalidate();
      toast.info("Sessão encerrada com sucesso");
      window.location.href = `/login?t=${Date.now()}`;
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const backendUser = meQuery.data ?? null;
    const userOrNull = meQuery.isLoading ? localUser : backendUser;

    if (backendUser) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(backendUser)
      );
    } else if (!meQuery.isLoading && backendUser === null) {
      localStorage.removeItem("manus-runtime-user-info");
    }

    const user = userOrNull ?? DEFAULT_USER;
    const isImpersonating = Boolean(backendUser?.isImpersonating);
    const vendedorNome = backendUser?.vendedorNome ?? undefined;

    return {
      user,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(userOrNull),
      isImpersonating,
      vendedorNome,
    };
  }, [
    localUser,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (state.loading) return;
    if (state.isAuthenticated) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    console.log("Usuário não autenticado, redirecionando para", redirectPath);
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    state.loading,
    state.isAuthenticated,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    isImpersonating: state.isImpersonating,
    vendedorNome: state.vendedorNome,
    voltarAoAdmin,
  };
}
