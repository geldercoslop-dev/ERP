import { useApiHealthOptional } from "../contexts/ApiHealthContext";

/**
 * Status da API no shell: 🟡 checking, 🟢 online, 🔴 offline.
 */
export function ApiStatusBanner() {
  const health = useApiHealthOptional();
  if (!health) return null;

  const { status } = health;

  if (status === "checking") {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border-b"
        style={{
          background: "rgba(234,179,8,0.14)",
          borderColor: "rgba(234,179,8,0.35)",
          color: "#fef08a",
        }}
        role="status"
      >
        <span className="text-base leading-none" aria-hidden>
          🟡
        </span>
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" aria-hidden />
        <span>Verificando conexão com o servidor…</span>
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border-b"
        style={{
          background: "rgba(239,68,68,0.15)",
          borderColor: "rgba(239,68,68,0.35)",
          color: "#fecaca",
        }}
        role="status"
      >
        <span className="text-base leading-none" aria-hidden>
          🔴
        </span>
        <span>Offline — integração em pausa; use dados locais onde disponível.</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border-b"
      style={{
        background: "rgba(13,217,163,0.10)",
        borderColor: "rgba(13,217,163,0.22)",
        color: "#a7f3d0",
      }}
      role="status"
    >
      <span className="text-base leading-none" aria-hidden>
        🟢
      </span>
      <span>Online</span>
    </div>
  );
}
