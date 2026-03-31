import React, { useState, useEffect, useRef } from "react";
import { Search, User, Package, FileText, Truck, Loader2, X, Command, Sparkles } from "lucide-react";
import { Input } from "../ui/input";
import { trpc } from "../../lib/trpcClient";
import { useLocation } from "wouter";
import { useDebouncedValue } from "../../hooks/useDebounce";

/**
 * GlobalSearch: Busca integrada do ERP.
 * Pesquisa em Clientes, Produtos, Pedidos e Cargas em tempo real.
 */
export function GlobalSearch() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Queries (enabled apenas quando há query)
  const clientes = trpc.clientes.buscaGlobal.useQuery(
    { term: debouncedQuery, limit: 5 },
    { enabled: debouncedQuery.length >= 2 }
  );
  const produtos = trpc.produtos.buscar.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );
  const pedidos = trpc.pedidos.buscar.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );
  // Cargas (usando listCargas com filtro se disponível, ou apenas filtrando no client)
  // Para este exemplo, usaremos uma busca por ID de carga ou cidade se disponível.

  const hasResults = 
    (clientes.data?.length ?? 0) > 0 || 
    (produtos.data?.produtos?.length ?? 0) > 0 || 
    (pedidos.data?.pedidos?.length ?? 0) > 0;

  const isLoading = clientes.isLoading || produtos.isLoading || pedidos.isLoading;

  // Lógica de Comandos LEO
  const isLeoCommand = query.toLowerCase().startsWith("leo ");
  const leoCommands = [
    { label: "Vendas hoje", cmd: "leo vendas hoje", href: "/vendas" },
    { label: "Estoque crítico", cmd: "leo estoque crítico", href: "/estoque?filtro=baixo" },
    { label: "Pedidos atrasados", cmd: "leo pedidos atrasados", href: "/meus-pedidos?status=atrasado" },
    { label: "Resumo financeiro", cmd: "leo financeiro", href: "/financeiro" },
  ].filter(c => c.cmd.includes(query.toLowerCase()));

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigateTo = (path: string) => {
    setLocation(path);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="relative w-full max-w-md" ref={containerRef}>
      <div className="relative group">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${isOpen ? 'text-primary' : 'text-muted-foreground'}`} />
        <Input
          placeholder="Buscar clientes, produtos, pedidos..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-10 h-10 rounded-xl bg-slate-100/50 border-transparent focus:bg-white focus:border-primary/20 transition-all duration-200"
        />
        {query && (
          <button 
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
        <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] text-muted-foreground pointer-events-none">
          <Command className="h-2.5 w-2.5" />
          <span>K</span>
        </div>
      </div>

      {/* Dropdown de resultados */}
      {isOpen && (query.length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[70vh] overflow-y-auto p-2 scrollbar-hide">
            {isLoading && (
              <div className="flex items-center justify-center p-8 gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Buscando em todo o ERP...
              </div>
            )}

            {!isLoading && !hasResults && !isLeoCommand && (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhum resultado para "{query}"</p>
              </div>
            )}

            {/* Seção: Comandos LEO */}
            {isLeoCommand && leoCommands.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <Sparkles className="h-3 w-3" /> Comandos LEO
                </div>
                {leoCommands.map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => navigateTo(c.href)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-primary/5 rounded-xl transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{c.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">Executar comando: {c.cmd}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Seção: Clientes */}
            {clientes.data && clientes.data.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <User className="h-3 w-3" /> Clientes
                </div>
                {clientes.data.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => navigateTo(`/clientes?id=${c.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                      <User className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{c.nome}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{c.cidade} • {c.telefone}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Seção: Produtos */}
            {produtos.data?.produtos && produtos.data.produtos.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Package className="h-3 w-3" /> Produtos
                </div>
                {produtos.data.produtos.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => navigateTo(`/produtos?id=${p.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                      <Package className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{p.descricao}</div>
                      <div className="text-[10px] text-muted-foreground truncate">Estoque: {p.estoque} • R$ {Number(p.valorVenda).toFixed(2)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Seção: Pedidos */}
            {pedidos.data?.pedidos && pedidos.data.pedidos.length > 0 && (
              <div className="mb-2">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3 w-3" /> Pedidos
                </div>
                {pedidos.data.pedidos.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => navigateTo(`/meus-pedidos?id=${p.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl transition-colors text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 group-hover:bg-purple-100 transition-colors">
                      <FileText className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">Pedido #{String(p.numero).padStart(4, '0')}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{p.clienteNome} • {p.status}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="bg-slate-50 px-4 py-2 border-t text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Pressione ESC para fechar</span>
            <span>GRS ATUAL ERP</span>
          </div>
        </div>
      )}
    </div>
  );
}
