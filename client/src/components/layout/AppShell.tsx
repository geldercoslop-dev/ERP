import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Menu,
  LogOut,
  ChevronRight,
  LayoutDashboard,
  Home,
  Plus,
  ShoppingCart,
  Users,
  UserCheck,
  Percent,
  Boxes,
  Package,
  ClipboardList,
  Truck,
  MapPin,
  Receipt,
  DollarSign,
  Banknote,
  Landmark,
  TrendingUp,
  BookOpen,
  BookMarked,
  PieChart,
  UserCog,
  Store,
  Building2,
  Palette,
  Sliders,
  CreditCard,
  BarChart3,
  User,
  AlertTriangle,
  Activity,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import leo from "@/assets/leo_transparent.png";
import { useAuth } from "@/hooks/useAuth";
import { APP_VERSION } from "@/const";
import { menuConfig } from "@/config/menuConfig";
import { GlobalSearch } from "@/components/GlobalSearch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpcClient";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const SIDEBAR_STYLE = {
  fontFamily: "'Sora', system-ui, sans-serif",
  width: "224px",
  bg: "#122030",
  borderRight: "1px solid rgba(255,255,255,0.055)",
  textPrimary: "#E2EDF8",
  textSecondary: "#5D7A96",
  textMuted: "#2A3F55",
  accent: "#D4A843",
  hoverBg: "#1A2E44",
  activeBg: "transparent",
  activeBorder: "transparent",
  badgeGreen: "#0DD9A3",
} as const;

/** Mapeia iconName do menuConfig para componente Lucide — ícones elegantes e específicos */
const MENU_ICONS: Record<string, LucideIcon> = {
  home:              Home,
  plus:              Plus,
  "file-text":       ShoppingCart,
  users:             Users,
  tag:               Percent,
  package:           Boxes,
  "clipboard-list":  ClipboardList,
  "alert-triangle":  AlertTriangle,
  truck:             Truck,
  receipt:           Receipt,
  "dollar-sign":     Banknote,
  "credit-card":     CreditCard,
  "bar-chart-3":     TrendingUp,
  "book-open":       BookMarked,
  "user-cog":        UserCog,
  "building-2":      Store,
  activity:          Activity,
};

/** Cor de cada ícone — própria e elegante por item */
const MENU_ICON_COLORS: Record<string, string> = {
  home:              "#D4A843",   // dourado — painel
  plus:              "#34D399",   // verde menta — novo pedido
  "file-text":       "#60A5FA",   // azul claro — pedidos/carrinho
  users:             "#A78BFA",   // lilás — clientes
  tag:               "#FB923C",   // laranja — promoções
  package:           "#38BDF8",   // azul céu — produtos
  "clipboard-list":  "#F472B6",   // rosa — listas
  "alert-triangle":  "#F59E0B",   // âmbar — pendências de estoque
  truck:             "#4ADE80",   // verde — cargas/entregas
  receipt:           "#FCD34D",   // amarelo ouro — nota entrada
  "dollar-sign":     "#86EFAC",   // verde claro — comissões/financeiro
  "credit-card":     "#C084FC",   // roxo — boletos/contas
  "bar-chart-3":     "#67E8F9",   // ciano — relatórios/histórico
  "book-open":       "#FCA5A5",   // salmão — contas fixas/plano
  "user-cog":        "#94A3B8",   // cinza azulado — cadastros
  "building-2":      "#6EE7B7",   // verde esmeralda — fornecedores
  activity:          "#A78BFA",   // lilás — diagnóstico
};

/** Cor do fundo do ícone — leve, baseada na cor do ícone */
const MENU_ICON_BG: Record<string, string> = {
  home:              "rgba(212,168,67,0.15)",
  plus:              "rgba(52,211,153,0.12)",
  "file-text":       "rgba(96,165,250,0.12)",
  users:             "rgba(167,139,250,0.12)",
  tag:               "rgba(251,146,60,0.12)",
  package:           "rgba(56,189,248,0.12)",
  "clipboard-list":  "rgba(244,114,182,0.12)",
  "alert-triangle":  "rgba(245,158,11,0.12)",
  truck:             "rgba(74,222,128,0.12)",
  receipt:           "rgba(252,211,77,0.12)",
  "dollar-sign":     "rgba(134,239,172,0.12)",
  "credit-card":     "rgba(192,132,252,0.12)",
  "bar-chart-3":     "rgba(103,232,249,0.12)",
  "book-open":       "rgba(252,165,165,0.12)",
  "user-cog":        "rgba(148,163,184,0.10)",
  "building-2":      "rgba(110,231,183,0.12)",
  activity:          "rgba(167,139,250,0.12)",
};

/** Cores por seção (labels): Comercial azul, Operacional verde, Logística laranja, Financeiro roxo, etc. */
function getGroupColor(group: string): { label: string } {
  switch (group) {
    case "PAINEL":       return { label: "#D4A843" };
    case "COMERCIAL":    return { label: "#3B9EFF" };
    case "OPERACIONAL":  return { label: "#0DD9A3" };
    case "LOGÍSTICA":    return { label: "#F97B4B" };
    case "FINANCEIRO":   return { label: "#A78BFA" };
    case "RELATÓRIOS":   return { label: "#67E8F9" };
    case "CADASTROS":    return { label: "#6EE7B7" };
    default:             return { label: SIDEBAR_STYLE.textMuted };
  }
}

/** Hook: busca contadores reais do backend de forma segura */
function useMenuCounters(isAuthenticated: boolean) {
  const opts = { enabled: isAuthenticated, staleTime: 60_000, refetchOnWindowFocus: false };

  const pedidos = trpc.pedidos.list.useQuery(
    { status: "GERADO" },
    { ...opts, select: (d: any) => (Array.isArray(d) ? d.length : (d?.items?.length ?? 0)) }
  );
  const promocoes = trpc.promocoes.list.useQuery(
    undefined,
    {
      ...opts,
      select: (d: any) => {
        if (!Array.isArray(d)) return 0;
        const hoje = new Date();
        return d.filter((p: any) => {
          if (!p.ativo) return false;
          const ini = new Date(p.inicio ?? p.dataInicio ?? 0);
          const fim = new Date(p.fim ?? p.dataFim ?? 0);
          return ini <= hoje && fim >= hoje;
        }).length;
      },
    }
  );
  const pendencias = trpc.pendencias.list.useQuery(
    undefined,
    { ...opts, select: (d: any) => (Array.isArray(d) ? d.filter((p: any) => p.status !== "IMPRESSO" && p.status !== "CANCELADO").length : 0) }
  );
  const entregas = trpc.cargas.list.useQuery(
    undefined,
    { ...opts, select: (d: any) => (Array.isArray(d) ? d.filter((c: any) => !c.dataBaixa && c.status !== "ENTREGUE").length : 0) }
  );

  return {
    pedidos:   pedidos.data  ?? 0,
    promocoes: promocoes.data ?? 0,
    pendencias: pendencias.data ?? 0,
    entregas:  entregas.data ?? 0,
  };
}

/** Badge visual do contador */
function MenuBadge({ count, type }: { count: number; type: "num" | "ok" | "alert" }) {
  if (!count || count <= 0) return null;
  const styles = {
    num:   { bg: "rgba(212,168,67,0.15)",  color: "#D4A843", border: "rgba(212,168,67,0.30)"  },
    ok:    { bg: "rgba(13,217,163,0.12)",  color: "#0DD9A3", border: "rgba(13,217,163,0.25)"  },
    alert: { bg: "rgba(249,123,75,0.14)",  color: "#F97B4B", border: "rgba(249,123,75,0.30)"  },
  }[type];
  return (
    <span
      className="shrink-0 text-[8.5px] font-semibold px-[5px] py-[1px] rounded-full border"
      style={{ background: styles.bg, color: styles.color, borderColor: styles.border, lineHeight: 1.4 }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Badge "Ativo" para promoções */
function BadgeAtivo({ count }: { count: number }) {
  if (!count || count <= 0) return null;
  return (
    <span
      className="shrink-0 text-[8.5px] font-semibold px-[5px] py-[1px] rounded-full border"
      style={{ background: "rgba(13,217,163,0.12)", color: "#0DD9A3", borderColor: "rgba(13,217,163,0.22)", lineHeight: 1.4 }}
    >
      Ativo
    </span>
  );
}

export default function AppShell({ children }: PropsWithChildren) {
  const [location, setLocation] = useLocation();
  const fullLocation = typeof window !== "undefined" ? window.location.pathname + window.location.search : location;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSubmenuHref, setOpenSubmenuHref] = useState<string | null>(null);
  const [trocarVendedorModalOpen, setTrocarVendedorModalOpen] = useState(false);
  const [trocarVendedorId, setTrocarVendedorId] = useState<number | null>(null);

  const redirectToLogin = true;
  const { user, isAuthenticated, isLoading: loading, logout, isImpersonating, vendedorNome, voltarAoAdmin } = useAuth({ redirectOnUnauthenticated: redirectToLogin, redirectPath: "/login" });

  const isAdmin = user?.role === "admin";
  const vendedoresQuery = trpc.vendedores.list.useQuery(undefined, { enabled: isAdmin && trocarVendedorModalOpen });
  const impersonateMutation = trpc.auth.impersonateVendedor.useMutation({
    onSuccess: () => {
      toast.success("Entrou como vendedor. Use 'Voltar ao admin' no topo para retornar.");
      setTrocarVendedorModalOpen(false);
      setTrocarVendedorId(null);
      window.location.href = "/";
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? "Erro ao entrar como vendedor"),
  });

  // Contadores reais do backend — só carrega se autenticado
  const counters = useMenuCounters(isAuthenticated);

  /** Retorna badge para um item de menu específico */
  const getBadge = (href: string, label: string) => {
    if (href === "/vendas" || href === "/meus-pedidos" || label === "Pedidos")
      return <MenuBadge count={counters.pedidos} type="num" />;
    if (href === "/promocoes" || label === "Promoções")
      return <BadgeAtivo count={counters.promocoes} />;
    if (href === "/pendencias" || label === "Pendências de Compra")
      return <MenuBadge count={counters.pendencias} type="alert" />;
    if (href === "/entregas" || label === "Entregas")
      return <MenuBadge count={counters.entregas} type="alert" />;
    return null;
  };

  const renderContent = () => {
    if (redirectToLogin && !isAuthenticated) {
      if (loading) {
        return (
          <div className="h-screen flex overflow-hidden" style={{ background: "linear-gradient(150deg, #111E30 0%, #0A1422 100%)" }}>
            <main className="flex-1 flex flex-col min-w-0 lg:ml-[224px] h-screen" />
          </div>
        );
      }
      return (
        <div className="min-h-screen executive-bg text-white flex items-center justify-center flex-col">
          <div className="text-white/80 text-xl mb-2">Sessão não encontrada</div>
          <div className="text-white/60 mb-4">Redirecionando para o login...</div>
          <div className="text-white/40 text-xs">Não autenticado</div>
          <button
            onClick={() => window.location.href = '/login?force=true'}
            className="mt-6 px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 rounded-md text-white/90 transition-colors"
          >
            Ir para o login
          </button>
        </div>
      );
    }

    return (
      <div className="h-screen flex overflow-hidden" style={{ background: "linear-gradient(150deg, #111E30 0%, #0A1422 100%)" }}>
        {/* Banner modo vendedor (impersonation) */}
        {isImpersonating && (
          <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 gap-3 shadow-lg" style={{ background: "linear-gradient(90deg, #1e3a5f 0%, #2d4a6f 100%)", borderBottom: "1px solid rgba(212,168,67,0.35)" }}>
            <span className="text-sm font-medium truncate" style={{ color: SIDEBAR_STYLE.textPrimary }}>
              Modo vendedor: <span style={{ color: SIDEBAR_STYLE.accent }}>{vendedorNome ?? "Vendedor"}</span>
            </span>
            <button
              type="button"
              onClick={voltarAoAdmin}
              className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
              style={{ background: SIDEBAR_STYLE.accent, color: "#0A1422" }}
            >
              Voltar ao admin
            </button>
          </div>
        )}

        {/* Sidebar fixo (desktop) */}
        <aside
          className={`hidden lg:flex flex-col fixed left-0 bottom-0 z-30 ${isImpersonating ? "top-12" : "top-0"}`}
          style={{ width: SIDEBAR_STYLE.width, background: SIDEBAR_STYLE.bg, borderRight: SIDEBAR_STYLE.borderRight, fontFamily: SIDEBAR_STYLE.fontFamily }}
        >
          <div className="flex-1 min-h-0 flex flex-col">
            {SidebarContent}
          </div>
        </aside>

        {/* Mobile header */}
        <div className={`fixed left-0 right-0 flex items-center justify-between px-4 py-3 lg:hidden z-20 border-b border-white/5 ${isImpersonating ? "top-12" : "top-0"}`} style={{ background: SIDEBAR_STYLE.bg }}>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
            style={{ color: SIDEBAR_STYLE.textPrimary }}
          >
            <Menu className="h-4 w-4" />
            Menu
          </button>
          <div className="text-xs" style={{ color: SIDEBAR_STYLE.textSecondary }}>{APP_VERSION}</div>
        </div>

        {/* Área principal */}
        <main className={`flex-1 flex flex-col min-w-0 lg:ml-[224px] h-screen ${isImpersonating ? "pt-12" : ""}`}>
          <header className={`shrink-0 px-6 py-4 border-b border-white/5 ${isImpersonating ? "pt-2" : "pt-14 lg:pt-5"}`}>
            <div className="mx-auto max-w-[1500px] flex flex-wrap items-center gap-6">
              <div className="min-w-0">
                <span className="text-base font-semibold" style={{ color: SIDEBAR_STYLE.textPrimary }}>
                  Olá, <span style={{ color: SIDEBAR_STYLE.accent }}>{user?.name?.trim()?.split(/\s+/)[0] || "Usuário"}</span>!
                </span>
                <div className="text-[10.5px] mt-0.5" style={{ color: SIDEBAR_STYLE.textSecondary }}>
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </div>
              </div>
              {isAdmin && !isImpersonating && (
                <button
                  type="button"
                  onClick={() => setTrocarVendedorModalOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
                  style={{ background: "rgba(212,168,67,0.18)", color: SIDEBAR_STYLE.accent, border: "1px solid rgba(212,168,67,0.35)" }}
                >
                  <UserRoundCog className="h-4 w-4" />
                  Trocar para vendedor
                </button>
              )}
              <div className="flex items-center gap-2 min-w-[240px] max-w-[320px]">
                <GlobalSearch
                  onNavigate={(to) => setLocation(to)}
                  placeholder="Buscar cliente, pedido, produto…"
                  variant="dark"
                  className="w-full h-9 rounded-lg"
                />
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5">
            <div className="mx-auto max-w-[1500px]">
              {location === "/" ? (
                <>
                  {children}
                  <div className="fixed bottom-6 right-6 lg:right-8 z-10 pointer-events-none hidden md:block">
                    <div className="relative">
                      <img src={leo} alt="Léo" className="h-[120px] w-auto opacity-90" />
                      <div className="mt-2 flex items-center justify-end gap-2 text-xs" style={{ color: SIDEBAR_STYLE.textSecondary }}>
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: SIDEBAR_STYLE.badgeGreen, boxShadow: `0 0 8px ${SIDEBAR_STYLE.badgeGreen}` }} />
                        <span>{APP_VERSION}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="relative min-h-[400px] mt-4 overflow-hidden rounded-[12px]"
                  style={{
                    background: "#162336",
                    border: "1px solid rgba(212,168,67,0.20)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.04)",
                    padding: "20px 24px",
                  }}
                >
                  {children}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[224px] flex flex-col" style={{ background: SIDEBAR_STYLE.bg, borderRight: SIDEBAR_STYLE.borderRight, fontFamily: SIDEBAR_STYLE.fontFamily }}>
              {SidebarContent}
            </div>
          </div>
        )}

        {/* Modal Trocar para vendedor (só admin) */}
        {trocarVendedorModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setTrocarVendedorModalOpen(false)}>
            <div
              className="rounded-xl shadow-xl w-full max-w-md p-5 flex flex-col gap-4"
              style={{ background: SIDEBAR_STYLE.bg, border: "1px solid rgba(255,255,255,0.08)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold" style={{ color: SIDEBAR_STYLE.textPrimary }}>Trocar para vendedor</h3>
              <p className="text-sm" style={{ color: SIDEBAR_STYLE.textSecondary }}>Escolha o vendedor para entrar no lugar dele. Use &quot;Voltar ao admin&quot; no topo para retornar.</p>
              <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
                {vendedoresQuery.isLoading && <span className="text-sm" style={{ color: SIDEBAR_STYLE.textMuted }}>Carregando...</span>}
                {vendedoresQuery.data?.map((v: { id: number; nome: string; cidade?: string | null }) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setTrocarVendedorId(trocarVendedorId === v.id ? null : v.id)}
                    className="text-left px-3 py-2 rounded-lg transition-colors"
                    style={{
                      background: trocarVendedorId === v.id ? "rgba(212,168,67,0.25)" : "rgba(255,255,255,0.05)",
                      color: SIDEBAR_STYLE.textPrimary,
                      border: trocarVendedorId === v.id ? "1px solid rgba(212,168,67,0.5)" : "1px solid transparent",
                    }}
                  >
                    <span className="font-medium">{v.nome}</span>
                    <span className="text-xs opacity-70 ml-1">(id: {v.id}{v.cidade ? ` · ${v.cidade}` : ""})</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setTrocarVendedorModalOpen(false); setTrocarVendedorId(null); }}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ color: SIDEBAR_STYLE.textSecondary, background: "rgba(255,255,255,0.06)" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={trocarVendedorId == null || impersonateMutation.isPending}
                  onClick={() => {
                    if (trocarVendedorId != null) impersonateMutation.mutate({ vendedorId: trocarVendedorId });
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: SIDEBAR_STYLE.accent, color: "#0A1422" }}
                >
                  {impersonateMutation.isPending ? "Entrando…" : "Entrar como vendedor"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const greeting = useMemo(() => {
    const name = user?.name?.trim();
    const first = name ? name.split(/\s+/)[0] : "Usuário";
    return `Olá, ${first}!`;
  }, [user]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setTrocarVendedorModalOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredMenu = useMemo(() => {
    return menuConfig
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !user?.role || item.roles.includes(user.role as "admin" | "vendedor")
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [user?.role]);

  const toggleSubmenu = (itemHref: string) => {
    setOpenSubmenuHref((prev) => (prev === itemHref ? null : itemHref));
  };

  const SidebarContent = (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-4 pt-[18px] pb-[14px] shrink-0 border-b border-white/[0.055]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #D4A843 0%, #A67C20 100%)", boxShadow: "0 0 14px rgba(212,168,67,0.3)" }}
          >
            <LayoutDashboard className="w-4 h-4 text-[#1A0F00]" strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-[12.5px] font-bold uppercase tracking-wider" style={{ color: SIDEBAR_STYLE.textPrimary, letterSpacing: "0.06em" }}>Gestão</div>
            <div className="text-[9px] font-medium" style={{ color: SIDEBAR_STYLE.accent, letterSpacing: "0.1em", marginTop: 2, opacity: 0.9 }}>e Finanças</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto sidebar-nav-scroll py-1" style={{ paddingLeft: 8, paddingRight: 8 }}>
        {filteredMenu.map((group) => {
          const isOnlyOne = group.items.length === 1;
          return (
            <div key={group.group} className="mb-1">
              {/* Label da seção — FIXO, não clicável, sem seta */}
              {(filteredMenu.length > 1 || !isOnlyOne) && (
                <div
                  className="w-full flex items-center gap-1.5 px-2 py-2 uppercase tracking-[0.18em] text-left select-none"
                  style={{ fontSize: "8.5px", fontWeight: 600, color: getGroupColor(group.group).label }}
                >
                  <span>{group.group}</span>
                  <span className="flex-1 h-px shrink-0 min-w-[8px]" style={{ background: "rgba(255,255,255,0.055)" }} />
                </div>
              )}

              {group.items.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isSubOpen = openSubmenuHref === item.href;
                const path = location?.replace(/\?.*$/, "") ?? "";

                // Ativo SOMENTE quando a rota bate — nunca pelo clique no submenu
                const active =
                  item.href === "/"
                    ? path === "/" || path === ""
                    : path === item.href || (item.href !== "/" && path.startsWith(item.href + "/"));
                const isChildActive = hasChildren && item.children!.some((c) => {
                  const chPath = c.href?.replace(/\?.*$/, "") ?? c.href;
                  return path === chPath || path === c.href || (c.href !== "/" && c.href !== "" && (path.startsWith(c.href) || path.startsWith(chPath + "/")));
                });

                // Para items com submenu: NUNCA marcar como ativo pelo toggle — só pela rota
                const isParentActive = active || isChildActive;

                const iconColor = MENU_ICON_COLORS[item.iconName] ?? SIDEBAR_STYLE.textSecondary;
                const iconBg    = MENU_ICON_BG[item.iconName]    ?? "rgba(255,255,255,0.07)";
                const Icon      = MENU_ICONS[item.iconName]       ?? LayoutDashboard;

                const itemStyle = {
                  background:  isParentActive ? SIDEBAR_STYLE.activeBg   : "transparent",
                  color:       isParentActive ? SIDEBAR_STYLE.accent      : SIDEBAR_STYLE.textSecondary,
                  borderColor: isParentActive ? SIDEBAR_STYLE.activeBorder : "transparent",
                };

                return (
                  <div key={item.href} className="mb-px">
                    <div className="flex items-center">
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => { setMobileOpen(false); toggleSubmenu(item.href); }}
                          className={classNames(
                            "flex-1 flex items-center gap-2 rounded-md py-[5px] text-[12px] transition-all duration-[130ms] ease-out min-w-0 text-left",
                            "hover:bg-[#1A2E44] hover:text-[#E2EDF8]",
                            isParentActive ? "border-l-2 pl-[7px] -ml-px border-[#D4A843]" : "pl-2 border-l-2 border-transparent"
                          )}
                          style={itemStyle}
                        >
                          <span className="w-[22px] h-[22px] flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} style={{ color: iconColor }} />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {getBadge(item.href, item.label)}
                          <ChevronRight
                            className={classNames("h-[9px] w-[9px] shrink-0 transition-transform duration-200 ml-0.5", isSubOpen && "rotate-90")}
                            style={{ color: isSubOpen ? SIDEBAR_STYLE.accent : SIDEBAR_STYLE.textMuted }}
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMobileOpen(false);
                            if (item.href === "/" && location === "/") return;
                            setLocation(item.href);
                          }}
                          className={classNames(
                            "flex-1 flex items-center gap-2 rounded-md py-[5px] text-[12px] transition-all duration-[130ms] ease-out min-w-0 text-left w-full",
                            "hover:bg-[#1A2E44] hover:text-[#E2EDF8]",
                            active ? "border-l-2 pl-[7px] -ml-px border-[#D4A843]" : "pl-2 border-l-2 border-transparent"
                          )}
                          style={itemStyle}
                        >
                          <span className="w-[22px] h-[22px] flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} style={{ color: iconColor }} />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {getBadge(item.href, item.label)}
                        </button>
                      )}
                    </div>

                    {/* Subitens colapsáveis */}
                    {hasChildren && isSubOpen && (
                      <div className="overflow-hidden" style={{ maxHeight: 400 }}>
                        {item.children!.map((child) => {
                          const childPath = (child.href ?? "").replace(/\?.*$/, "");
                          const hasQuery = (child.href ?? "").includes("?");
                          const currentHasQuery = fullLocation.includes("?");
                          const childActive =
                            fullLocation === (child.href ?? "")
                            || (path === childPath && !hasQuery && !currentHasQuery)
                            || (childPath !== "" && path.startsWith(childPath + "/") && !hasQuery && !currentHasQuery);
                          return (
                            <button
                              key={child.href}
                              type="button"
                              onClick={() => { setMobileOpen(false); setLocation(child.href); }}
                              className={classNames(
                                "relative block w-full text-left py-1 pr-2 text-[11.5px] rounded-md transition-all duration-[130ms] border-l-2 -ml-px hover:bg-[#1A2E44] hover:text-[#E2EDF8]",
                                childActive ? "border-l-[#D4A843]" : "border-transparent"
                              )}
                              style={{
                                paddingLeft: 40,
                                color: childActive ? SIDEBAR_STYLE.accent : SIDEBAR_STYLE.textSecondary,
                                background: childActive ? SIDEBAR_STYLE.hoverBg : "transparent",
                              }}
                            >
                              <span className="absolute left-[22px] top-1/2 -translate-y-1/2 w-1 h-1 rounded-full" style={{ background: childActive ? SIDEBAR_STYLE.accent : SIDEBAR_STYLE.textMuted }} />
                              <span className="pl-1">{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer do usuário */}
      <div className="shrink-0 border-t border-white/[0.055] px-3 py-2.5" style={{ background: "rgba(0,0,0,0.14)" }}>
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center" style={{ color: SIDEBAR_STYLE.accent }}>
            <User className="w-5 h-5" strokeWidth={1.8} stroke="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold" style={{ color: SIDEBAR_STYLE.textPrimary }}>{user?.name ?? "Usuário"}</div>
            <span className="inline-block mt-0.5 text-[9.5px] uppercase tracking-wider" style={{ color: SIDEBAR_STYLE.textSecondary }}>
              {user?.role === "admin" ? "Administrador" : "Vendedor"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { toast.info("Trocar usuário..."); logout(); }}
            className="text-[10px] px-2 py-1 rounded border transition-colors hover:bg-amber-500/10 hover:border-amber-500/40"
            style={{ borderColor: "rgba(255,255,255,0.08)", color: SIDEBAR_STYLE.textSecondary }}
            title="Trocar usuário (volta ao login)"
          >
            Trocar
          </button>
          <button
            type="button"
            onClick={() => { toast.info("Saindo do sistema..."); logout(); }}
            className="w-[26px] h-[26px] rounded-md flex items-center justify-center border transition-colors hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
            style={{ borderColor: "rgba(255,255,255,0.055)", color: SIDEBAR_STYLE.textMuted }}
            title="Sair"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return renderContent();
}
