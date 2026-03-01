import { useAuth } from '@/hooks/useAuth';

export function SessionDebugger() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-2 left-2 z-40 py-1.5 px-2 rounded bg-black/70 text-white text-[10px] font-mono max-w-[220px] shadow-lg border border-white/10">
      <div className="truncate">
        {isLoading ? "Carregando…" : isAuthenticated ? `OK: ${user?.name ?? "Usuário"}` : "Não autenticado"}
      </div>
    </div>
  );
}