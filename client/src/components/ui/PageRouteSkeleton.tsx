/**
 * Skeleton para Suspense de rotas — evita flash branco em páginas principais.
 */
export function PageRouteSkeleton() {
  return (
    <div
      className="min-h-[50vh] w-full animate-pulse rounded-xl p-6 space-y-4"
      style={{
        background: "linear-gradient(150deg, rgba(22,35,54,0.95) 0%, rgba(10,20,34,0.98) 100%)",
        border: "1px solid rgba(212,168,67,0.15)",
      }}
      aria-busy
      aria-label="Carregando página"
    >
      <div className="h-8 w-1/3 rounded-lg bg-white/10" />
      <div className="h-4 w-2/3 rounded bg-white/5" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <div className="h-28 rounded-xl bg-white/5" />
        <div className="h-28 rounded-xl bg-white/5" />
        <div className="h-28 rounded-xl bg-white/5" />
      </div>
      <div className="h-40 rounded-xl bg-white/5 mt-4" />
    </div>
  );
}
