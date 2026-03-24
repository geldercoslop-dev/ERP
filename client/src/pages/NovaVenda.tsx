import { useState, useMemo, useEffect, useRef } from "react";
import { onlyDigits, maskPhoneBr, maskMoney, parseMoney } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpcClient"; // Usar o novo cliente tRPC
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Search, CheckCircle, Package, User, CreditCard, Info, Wallet, Banknote, FileText, HelpCircle, CircleDollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner"; // Usar toast do sonner
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth"; // Usar o novo hook de autenticação
import { mensagemPendenciaGerada, mensagemVendaGerada } from "@/lib/pedidoMessages";
import { PAGE_WRAPPER, PAGE_MAIN } from "@/components/layout/pageLayout";
import { TRPCClientError } from "@trpc/client"; // Para tipagem de erros
import { inDevelopment, asyncInDevelopment } from "@/utils/inDevelopment"; // Para funções em desenvolvimento
import { useToast } from "@/hooks/use-toast"; // Importar o hook useToast
import { isInProgress } from "@shared/idempotency";

// Definir interface com tipagem mais precisa
interface ItemVenda {
  id: string;
  tipo: 'LIVRE' | 'CATALOGO';
  produtoId?: number;
  corId?: number;
  corNome?: string | null;
  descricao: string;
  marca?: string | null;
  isPremio?: boolean;
  quantidade: number;
  valorUnitario: number;
  // Para itens do catálogo: referência do preço cadastrado (para alertar promoções/descontos)
  valorMinimo?: number;
  custo: number;
  prazoGarantia: number;
}

export default function NovaVenda() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { user, isImpersonating, vendedorId: authVendedorId } = useAuth();
  const isAdmin = user?.role === "admin";
  const precisaEscolherVendedor = isAdmin && !isImpersonating;
  const vendedoresQuery = trpc.vendedores.list.useQuery(undefined, { enabled: precisaEscolherVendedor });

  // Suporte a ?edit=ID: carregar pedido para preencher o formulário (visualização/edição)
  const editId = useMemo(() => {
    const qs = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(qs);
    const id = params.get("edit");
    const num = id ? parseInt(id, 10) : NaN;
    return Number.isFinite(num) ? num : null;
  }, [location]);

  const initialCliente = {
    id: null as number | null,
    nome: "",
    telefone: "",
    telefoneRecado: "",
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "ES",
    referencia: "",
    condominio: "",
    bloco: "",
    apartamento: "",
  };
  
  // Estados do Pedido
  const [pedidoId, setPedidoId] = useState<number | null>(null);
  const [dialogSucesso, setDialogSucesso] = useState(false);
  const [loading, setLoading] = useState(false);

  // Admin sem impersonation: vendedor do pedido (obrigatório)
  const [selectedVendedorId, setSelectedVendedorId] = useState<number | null>(null);
  /** Vendedor efetivo do pedido: admin não impersonando = seleção do select; caso contrário = vendedor da sessão (auth). */
  const vendedorEfetivoId: number | null = precisaEscolherVendedor ? selectedVendedorId : (authVendedorId ?? null);
  // Estados do Cliente
  const [buscaCliente, setBuscaCliente] = useState("");
  const [cliente, setCliente] = useState(initialCliente);

  // Estados de Itens e Valores
  const [itens, setItens] = useState<ItemVenda[]>([]);
  // Preço unitário do catálogo: editável apenas para cima.
  const [buscaProduto, setBuscaProduto] = useState("");
  // Linhas rápidas (sempre 4) para lançar itens (Enter adiciona e cria mais linhas)
  const [linhasRapidas, setLinhasRapidas] = useState<string[]>(["", "", "", ""]);
  // Formas de pagamento (multi-seleção, no máximo 2)
  const [pagamentoMetodos, setPagamentoMetodos] = useState<Array<'PIX'|'DINHEIRO'|'CARTAO'|'BOLETO'|'A_DEFINIR'>>([]);
  const [desconto, setDesconto] = useState("0,00");
  const [frete, setFrete] = useState("0,00");
  // Pagamento combinado (planejado) - vai impresso no pedido.
  // Aqui NÃO escolhe forma da entrada (dinheiro/cartão/pix). Só registra o combinado:
  // - BOLETO (único): parcelas
  // - CARTÃO (único)
  // - ENTRADA + BOLETO (parcelas)
  // - ENTRADA + CARTÃO
  const [pagamentoTipo, setPagamentoTipo] = useState<'NENHUM'|'BOLETO'|'CARTAO'|'ENTRADA_BOLETO'|'ENTRADA_CARTAO'>('NENHUM');
  const [entradaValor, setEntradaValor] = useState("0,00");
  const [boletoParcelas, setBoletoParcelas] = useState(3);
  const [boletoPrimeiroVenc, setBoletoPrimeiroVenc] = useState(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState("");
  // Linha avulsa: sempre visível como primeira linha vazia; fechar só ao clicar na lixeira
  const [mostrarLinhaAvulso, setMostrarLinhaAvulso] = useState(true);
  const [linhaAvulso, setLinhaAvulso] = useState({ qtd: 1, desc: "", unit: "0,00" });

  // TRPC
  const { data: clientesResp } = trpc.clientes.list.useQuery();
  const termoBusca = buscaCliente.trim();
  const { data: clientesGlobal } = trpc.clientes.buscaGlobal.useQuery(
    { term: termoBusca, limit: 20 },
    { enabled: termoBusca.length >= 2 }
  );
  const { data: produtosResp } = trpc.produtos.list.useQuery();
  const clientes = (clientesResp as any)?.items ?? [];
  const produtos = (produtosResp as any)?.items ?? [];
  const { data: cores } = trpc.cores.list.useQuery();
  const criarVenda = trpc.pedidos.createVenda.useMutation();
  const gerarPDFPedido = trpc.pedidos.gerarPDF.useMutation();
  const vinculateCliente = trpc.clientes.vinculate.useMutation({
    onSuccess: () => { utils.clientes.list.invalidate(); },
  });
  const idempotencyKeyRef = useRef<string | null>(null);
  const { data: pedidoEdit, isLoading: loadingEdit } = trpc.pedidos.getById.useQuery(
    { id: editId! },
    { enabled: !!editId && editId > 0 }
  );

  // Preencher formulário quando abrir com ?edit=ID
  useEffect(() => {
    if (!pedidoEdit || !editId) return;
    // Usar tipagem mais específica
    const p = pedidoEdit;
    setPedidoId(p.id);
    setCliente({
      id: p.clienteId ?? null,
      nome: p.clienteNome ?? "",
      telefone: maskPhoneBr(p.clienteTelefone ?? ""),
      telefoneRecado: maskPhoneBr(p.clienteTelefoneRecado ?? ""),
      rua: p.clienteRua ?? "",
      numero: p.clienteNumero ?? "",
      bairro: p.clienteBairro ?? "",
      cidade: p.clienteCidade ?? "",
      uf: (p.clienteUf ?? "ES").toUpperCase(),
      referencia: p.clienteReferencia ?? "",
      condominio: p.clienteCondominio ?? "",
      bloco: p.clienteBloco ?? "",
      apartamento: p.clienteApartamento ?? "",
    });
    const sub = Number(p.subtotal ?? 0);
    const desc = Number(p.desconto ?? 0);
    const fr = Number(p.frete ?? 0);
    setDesconto(maskMoney(String(desc)));
    setFrete(maskMoney(String(fr)));
    setObservacoes(p.observacoes ?? "");
    let pagamentos: Array<'PIX'|'DINHEIRO'|'CARTAO'|'BOLETO'|'A_DEFINIR'> = [];
    try {
      const fp = p.formaPagamento;
      if (typeof fp === "string") {
        const parsed = JSON.parse(fp);
        if (Array.isArray(parsed)) pagamentos = parsed.slice(0, 2).filter((t: string) => ["PIX","DINHEIRO","CARTAO","BOLETO","A_DEFINIR"].includes(t));
      }
    } catch {
      // ignora
    }
    setPagamentoMetodos(pagamentos.length ? pagamentos : []);
    const itensDb = (p.itens ?? []) as any[];
    const novosItens: ItemVenda[] = itensDb.map((row, idx) => ({
      id: `edit_${row.id ?? idx}_${Date.now()}`,
      tipo: (row.tipo === "CATALOGO" ? "CATALOGO" : "LIVRE") as "LIVRE" | "CATALOGO",
      produtoId: row.produtoId ?? undefined,
      corId: row.corId ?? undefined,
      corNome: row.corNome ?? undefined,
      descricao: row.descricao ?? "",
      marca: row.marca,
      isPremio: false,
      quantidade: Number(row.quantidade ?? 1),
      valorUnitario: Number(row.valorUnitario ?? 0),
      valorMinimo: Number(row.valorUnitario ?? 0),
      custo: Number(row.custo ?? 0),
      prazoGarantia: Number(row.prazoGarantia ?? 90),
    }));
    setItens(novosItens);
  }, [pedidoEdit, editId]);

  const downloadDataUri = (dataUri: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = fileName;
    a.click();
  };




  const formatMoneyBRL = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  // Busca: global (qualquer cliente) quando termo >= 2; senão lista filtrada dos "meus clientes"
  const clientesFiltrados = useMemo(() => {
    if (!clientes || buscaCliente.length < 2) return [];
    const termo = buscaCliente.toLowerCase().trim();
    const tokens = termo.split(/\s+/).filter(Boolean);
    return clientes.filter((c: any) =>
      (tokens.length > 0 && tokens.every((t: string) => (c.nome || "").toLowerCase().includes(t))) ||
      (c.telefone || "").replace(/\D/g, "").includes(termo.replace(/\D/g, ""))
    ).slice(0, 5);
  }, [clientes, buscaCliente]);
  const clientesParaBusca = termoBusca.length >= 2 ? (clientesGlobal ?? []) : clientesFiltrados;

  // Filtros de Produtos
  const produtosFiltrados = useMemo(() => {
    if (!produtos || buscaProduto.length < 2) return [];
    const termo = buscaProduto.toLowerCase();
    return produtos.filter(p => 
      p.descricao.toLowerCase().includes(termo) || 
      p.marca?.toLowerCase().includes(termo)
    ).slice(0, 10);
  }, [produtos, buscaProduto]);

  /** Aplica cliente no estado e cabecário; única fonte de verdade para seleção. */
  const applySelectedCliente = (c: TCliente) => {
    setCliente({
      id: c.id,
      nome: c.nome || "",
      telefone: maskPhoneBr(c.telefone || ""),
      telefoneRecado: maskPhoneBr(c.telefoneRecado || ""),
      rua: c.rua || "",
      numero: c.numero || "",
      bairro: c.bairro || "",
      cidade: c.cidade || "",
      uf: c.uf || "ES",
      referencia: c.referencia || "",
      condominio: c.condominio || "",
      bloco: c.bloco || "",
      apartamento: c.apartamento || "",
    });
    setBuscaCliente("");
  };

  /** Só exige confirm quando o cliente pertence a outro vendedor (diferente do vendedor efetivo do pedido). */
  const shouldConfirmClienteOwnership = (
    principal: { vendedorId: number; vendedorNome: string } | null,
    efetivoId: number | null
  ): boolean => {
    if (!principal || efetivoId == null) return false;
    return principal.vendedorId !== efetivoId;
  };

  /** Seleção com busca global: aviso só se cliente pertence a OUTRO vendedor; vínculo em segundo plano; seleção SEMPRE aplicada após OK. */
  const selecionarClienteNaVenda = async (c: TCliente) => {
    const principalRaw = await utils.clientes.getVendedorPrincipal.fetch({ clienteId: c.id });
    const principal = principalRaw
      ? { vendedorId: principalRaw.vendedorId, vendedorNome: principalRaw.vendedorNome }
      : null;
    const precisaConfirmar = shouldConfirmClienteOwnership(principal, vendedorEfetivoId);
    if (precisaConfirmar && principal) {
      const continuar = window.confirm(`Cliente pertence a ${principal.vendedorNome}. Continuar mesmo assim?`);
      if (!continuar) return;
    }
    applySelectedCliente(c);
    const tipo = principal ? "SECUNDARIO" as const : "PRINCIPAL" as const;
    try {
      await vinculateCliente.mutateAsync({ clienteId: c.id, tipo });
    } catch {
      // Vínculo opcional; falha não deve impedir a seleção já aplicada
    }
  };

  const selecionarCliente = applySelectedCliente;

  const formatClienteCodigo = (id: number | null) => {
    if (!id) return "----";
    return String(id).padStart(4, "0");
  };

  // Usar tipagem mais específica
  const adicionarProdutoCatalogo = (p: TProduto) => {
    const base = Number(p.valorVenda || 0);
    const novoItem: ItemVenda = {
      id: `cat_${Date.now()}`,
      tipo: 'CATALOGO',
      produtoId: p.id,
      descricao: p.descricao || "",
      marca: p.marca,
      quantidade: 1,
      valorUnitario: base,
      valorMinimo: base,
      custo: Number(p.custo || 0),
      prazoGarantia: p.prazoGarantia || 0,
    };
    setItens((prev) => [...prev, novoItem]);
    setBuscaProduto("");
  };

  const adicionarItemAvulso = () => {
    const termo = (buscaProduto || "").trim().toLowerCase();
    if (termo.length < 2) return;
    const existeNoCatalogo = produtos?.some((p: any) => String(p.descricao || "").toLowerCase() === termo);
    if (existeNoCatalogo) {
      toast({ title: "Atenção", description: "Este produto já existe no catálogo. Selecione-o na lista.", variant: "destructive" });
      return;
    }
    const novoItem: ItemVenda = {
      id: `avulso_${Date.now()}`,
      tipo: "LIVRE",
      descricao: buscaProduto.trim().toUpperCase(),
      isPremio: false,
      quantidade: 1,
      valorUnitario: 0,
      custo: 0,
      prazoGarantia: 90,
    };
    setItens((prev) => [...prev, novoItem]);
    setBuscaProduto("");
  };

  const adicionarAvulsoPorDescricao = (desc: string) => {
    const termo = (desc || "").trim().toUpperCase();
    if (termo.length < 2) return;
    const existeNoCatalogo = produtos?.some((p: any) => String(p.descricao || "").toUpperCase() === termo);
    if (existeNoCatalogo) {
      toast({ title: "Atenção", description: "Este produto já existe no catálogo. Selecione-o na lista.", variant: "destructive" });
      return;
    }
    const novoItem: ItemVenda = {
      id: `avulso_${Date.now()}`,
      tipo: "LIVRE",
      descricao: termo,
      isPremio: false,
      quantidade: 1,
      valorUnitario: 0,
      custo: 0,
      prazoGarantia: 90,
    };
    setItens((prev) => [...prev, novoItem]);
  };

  /** Adiciona item avulso a partir da linha editável (botão Adicionar). */
  const adicionarAvulsoDesdeLinha = () => {
    const termo = (linhaAvulso.desc || "").trim().toUpperCase();
    if (termo.length < 2) {
      toast({ title: "Atenção", description: "Digite a descrição do item (mín. 2 caracteres).", variant: "destructive" });
      return;
    }
    const existeNoCatalogo = produtos?.some((p: any) => String(p.descricao || "").toUpperCase() === termo);
    if (existeNoCatalogo) {
      toast({ title: "Atenção", description: "Este produto já existe no catálogo. Use a busca de produtos.", variant: "destructive" });
      return;
    }
    const qtd = Math.max(1, Math.floor(linhaAvulso.qtd) || 1);
    const valorUnit = parseMoney(linhaAvulso.unit);
    const novoItem: ItemVenda = {
      id: `avulso_${Date.now()}`,
      tipo: "LIVRE",
      descricao: termo,
      isPremio: false,
      quantidade: qtd,
      valorUnitario: valorUnit,
      custo: 0,
      prazoGarantia: 90,
    };
    setItens((prev) => [...prev, novoItem]);
    setLinhaAvulso({ qtd: 1, desc: "", unit: "0,00" });
    setTimeout(() => linhaAvulsoQtdRef.current?.focus(), 120);
  };

  const adicionarPremio = () => {
    const desc = (buscaProduto || "PRÊMIO").toUpperCase();
    const novoItem: ItemVenda = {
      id: `premio_${Date.now()}`,
      tipo: 'LIVRE',
      descricao: desc,
      isPremio: true,
      quantidade: 1,
      valorUnitario: 0,
      custo: 0,
      prazoGarantia: 90,
    };
    setItens((prev) => [...prev, novoItem]);
    setBuscaProduto("");
  };


const togglePagamento = (m: 'PIX'|'DINHEIRO'|'CARTAO'|'BOLETO'|'A_DEFINIR') => {
  setPagamentoMetodos((prev) => {
    const has = prev.includes(m);
    return has ? prev.filter(x => x !== m) : [...prev, m];
  });
};

const addItemFromLinhaRapida = (idxLinha: number) => {
  const desc = (linhasRapidas[idxLinha] || "").trim();
  if (desc.length < 2) return;

  const termo = desc.toLowerCase();
  const existeNoCatalogo = produtos?.some(p => (p.descricao || '').toLowerCase() === termo);
  if (existeNoCatalogo) {
    toast({
      title: "Atenção",
      description: "Este produto já existe no catálogo. Selecione-o na busca acima.",
      variant: "destructive"
    });
    return;
  }

  const novoItem: ItemVenda = {
    id: `avulso_${Date.now()}`,
    tipo: 'LIVRE',
    descricao: desc.toUpperCase(),
    isPremio: false,
    quantidade: 1,
    valorUnitario: 0,
    custo: 0,
    prazoGarantia: 90,
  };
  setItens((prev) => [...prev, novoItem]);

  setLinhasRapidas((prev) => {
    const next = [...prev];
    next[idxLinha] = "";
    if (idxLinha === next.length - 1) next.push("");
    while (next.length < 4) next.push("");
    return next;
  });
};

  const removerItem = (id: string) => {
    setItens((prev) => prev.filter(i => i.id !== id));
  };

  const atualizarItem = (id: string, campo: keyof ItemVenda, valor: any) => {
    setItens((prev) => prev.map(i => i.id === id ? { ...i, [campo]: valor } : i));
  };

  const subtotal = useMemo(() => {
    return itens.reduce((sum, i) => sum + (i.quantidade * i.valorUnitario), 0);
  }, [itens]);

  const total = useMemo(() => {
    return subtotal - parseMoney(desconto) + parseMoney(frete);
  }, [subtotal, desconto, frete]);

  const salvarPedido = async () => {
    // Validações
    const telDigits = (cliente.telefone || "").replace(/\D/g, "");
    if (!cliente.nome || !telDigits || telDigits.length < 10 || !cliente.rua || !cliente.numero || !cliente.bairro || !cliente.cidade) {
      toast({
        title: "Erro",
        description: "Preencha os campos obrigatórios do cliente (Nome, Telefone, Rua, Número, Bairro, Cidade)",
        variant: "destructive",
      });
      return;
    }
    if (itens.length === 0) {
      toast({ title: "Erro", description: "Adicione pelo menos um produto", variant: "destructive" });
      return;
    }

    // Segurança: preço unitário do catálogo nunca pode ficar abaixo do preço vigente puxado do estoque.
    // Promoções entram pelo Módulo Promoções; descontos entram no campo DESCONTO do pedido.
    const itensAbaixo = itens.filter(i => i.tipo === 'CATALOGO' && typeof i.valorMinimo === 'number' && i.valorUnitario < (i.valorMinimo || 0) - 1e-9);
    if (itensAbaixo.length) {
      toast({
        title: 'Preço inválido',
        description: 'Valor unitário não pode ser menor que o preço vigente do estoque. Use DESCONTO se vendeu mais barato.',
        variant: 'destructive',
      });
      return;
    }
    if (precisaEscolherVendedor && !selectedVendedorId) {
      toast({ title: "Vendedor obrigatório", description: "Selecione o vendedor responsável pelo pedido.", variant: "destructive" });
      return;
    }
    setLoading(true);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `venda-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    try {
      const res = await criarVenda.mutateAsync({
        idempotencyKey: idempotencyKeyRef.current,
        vendedorId: precisaEscolherVendedor ? selectedVendedorId ?? undefined : undefined,
        clienteId: cliente.id ?? undefined,
        cliente: {
          nome: cliente.nome,
          telefone: (cliente.telefone ?? "").replace(/\D/g, ""),
          telefoneRecado: (cliente.telefoneRecado ?? "").replace(/\D/g, ""),
          rua: cliente.rua,
          numero: cliente.numero,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          uf: cliente.uf,
          referencia: cliente.referencia,
          condominio: cliente.condominio,
          bloco: cliente.bloco,
          apartamento: cliente.apartamento,
        },
        subtotal,
        desconto: parseMoney(desconto),
        frete: parseMoney(frete),
        total,
        pagamentoCombinado: undefined,
        observacoes: (observacoes || '').trim() || undefined,
        pagamentos: pagamentoMetodos.length ? pagamentoMetodos.map(t => ({ tipo: t })) : undefined,
        itens: itens.map(i => ({
          tipo: i.tipo,
          produtoId: i.produtoId,
          corId: i.corId,
          corNome: i.corNome,
          descricao: i.descricao,
          marca: i.marca,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          custo: i.custo,
          prazoGarantia: i.prazoGarantia,
          isPremio: !!i.isPremio,
        })),
      });
      if (isInProgress(res)) {
        toast({ title: "Processando", description: res.message ?? "Já está processando, aguarde…", variant: "default" });
        return;
      }
      idempotencyKeyRef.current = null;
      setPedidoId(res.pedidoId);
      if (res.clienteId != null) {
        setCliente((prev) => ({ ...prev, id: res.clienteId }));
      }
      setDialogSucesso(true);
      toast(mensagemVendaGerada(cliente.nome));
      if ((res as { pendenteEstoque?: boolean }).pendenteEstoque) {
        toast({ title: "Pedido pendente de estoque", description: "Pedido salvo como pendente de estoque." });
      }
      if (res.gerouPendencia) {
        toast(mensagemPendenciaGerada(cliente.nome));
      }
      utils.clientes.list.invalidate();
      utils.pedidos.list.invalidate();
      utils.pendencias.list.invalidate();
      utils.produtos.list.invalidate();
    } catch (error: unknown) {
      idempotencyKeyRef.current = null;
      const msg = error instanceof Error ? error.message : "Erro ao salvar o pedido. Tente novamente.";
      toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
      // Não resetar selectedVendedorId nem formulário; usuário pode corrigir e tentar de novo.
    } finally {
      setLoading(false);
    }
  };

  const limparFormulario = () => {
    setPedidoId(null);
    setDialogSucesso(false);
    setLoading(false);
    setSelectedVendedorId(null);
    setBuscaCliente("");
    setCliente(initialCliente);
    setItens([]);
    setBuscaProduto("");
    setMostrarLinhaAvulso(true);
    setLinhaAvulso({ qtd: 1, desc: "", unit: "0,00" });
    setDesconto("0,00");
    setFrete("0,00");
    setPagamentoTipo('NENHUM');
    setEntradaValor('0,00');
    setBoletoParcelas(3);
    setBoletoPrimeiroVenc(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setObservacoes("");
  };

  const inputLinhaNovaRef = useRef<HTMLInputElement>(null);
  const linhaAvulsoQtdRef = useRef<HTMLInputElement>(null);
  const linhaAvulsoUnitRef = useRef<HTMLInputElement>(null);

  return (
    <div className={PAGE_WRAPPER}>
      <main className={PAGE_MAIN + " max-w-5xl mx-auto space-y-6"}>
        {/* SEÇÃO 1: DADOS DO CLIENTE — bordas pouco arredondadas (rounded-md) */}
        <Card className="border-2 border-amber-200/60 shadow-md bg-white/95 text-slate-800 rounded-md">
          <CardContent className="p-6 space-y-4">
            <div className="pt-1 pb-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
                <User className="h-5 w-5" /> DADOS DO CLIENTE
              </div>
            </div>

            {/* Linha 1: Busca (menor) + Código cliente + Vendedor (campos menores) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-6 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-600" />
                <Input
                  placeholder="Buscar cliente (nome ou telefone)..."
                  value={buscaCliente}
                  onChange={e => setBuscaCliente(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && clientesParaBusca.length > 0) {
                      e.preventDefault();
                      selecionarClienteNaVenda(clientesParaBusca[0] as TCliente);
                    }
                  }}
                  className="pl-9 h-10 rounded-md border-2 border-amber-400/80 bg-amber-50/95 text-slate-800"
                />
                {clientesParaBusca.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border-2 border-amber-200 rounded-lg shadow-xl overflow-hidden">
                    {clientesParaBusca.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-2 hover:bg-amber-50 cursor-pointer flex justify-between items-center border-b last:border-0"
                        onClick={() => selecionarClienteNaVenda(c)}
                      >
                        <p className="font-bold text-sm uppercase">{c.nome}</p>
                        <Badge variant="outline" className="text-[10px]">SELECIONAR</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="md:col-span-3 flex items-center justify-between rounded-md border-2 border-slate-200 bg-slate-50 px-2 h-10 min-w-0">
                <span className="text-[10px] font-bold text-slate-600 truncate">CÓDIGO DO PEDIDO</span>
                <span className="font-black text-sm tracking-widest text-slate-900 truncate">{formatClienteCodigo(cliente.id)}</span>
              </div>
              <div className="md:col-span-3 min-w-0">
                <span className="text-[10px] font-bold text-slate-600 block mb-1">VENDEDOR</span>
                {precisaEscolherVendedor ? (
                  <Select
                    value={selectedVendedorId != null ? String(selectedVendedorId) : ""}
                    onValueChange={(v) => {
                      setSelectedVendedorId(v ? Number(v) : null);
                    }}
                  >
                    <SelectTrigger className="h-10 border-2 border-slate-200 bg-slate-50 text-slate-900 min-w-[140px]">
                      <SelectValue placeholder="Selecione o vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedoresQuery.data?.map((v: { id: number; nome: string; cidade?: string | null }) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.nome}{v.cidade ? ` (${v.cidade})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center justify-between rounded-md border-2 border-slate-200 bg-slate-50 px-2 h-10 min-w-0">
                    <span className="text-xs font-black uppercase text-slate-900 truncate">{user?.name ?? "-"}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Linha 2: Nome (grande) + Celular + Cel Recado (menor) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <Label className="text-xs font-bold text-slate-700">NOME *</Label>
                <Input value={cliente.nome} onChange={e => setCliente({ ...cliente, nome: e.target.value.toUpperCase() })} placeholder="Digite o nome do cliente" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs font-bold text-slate-700">CELULAR *</Label>
                <Input value={cliente.telefone} onChange={e => setCliente({ ...cliente, telefone: maskPhoneBr(e.target.value) })} placeholder="(00) 00000-0000" className="h-10 bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs font-bold text-slate-700">CEL RECADO</Label>
                <Input value={cliente.telefoneRecado} onChange={e => setCliente({ ...cliente, telefoneRecado: maskPhoneBr(e.target.value) })} placeholder="(00) 00000-0000" className="h-10 bg-white border-slate-300 rounded-md" />
              </div>
            </div>

            {/* Linha 3: Rua + Número */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-10">
                <Label className="text-xs font-bold text-slate-700">RUA *</Label>
                <Input value={cliente.rua} onChange={e => setCliente({ ...cliente, rua: e.target.value.toUpperCase() })} placeholder="Digite o nome da rua" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">NÚM</Label>
                <Input value={cliente.numero} onChange={e => setCliente({ ...cliente, numero: e.target.value.toUpperCase() })} placeholder="Número" className="h-10 bg-white border-slate-300 rounded-md" />
              </div>
            </div>

            {/* Linha 4: Bairro + Cidade + UF */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5">
                <Label className="text-xs font-bold text-slate-700">BAIRRO *</Label>
                <Input value={cliente.bairro} onChange={e => setCliente({ ...cliente, bairro: e.target.value.toUpperCase() })} placeholder="QUAL O BAIRRO ?" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-5">
                <Label className="text-xs font-bold text-slate-700">CIDADE *</Label>
                <Input value={cliente.cidade} onChange={e => setCliente({ ...cliente, cidade: e.target.value.toUpperCase() })} placeholder="Qual cidade?" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">UF</Label>
                <Input value={cliente.uf} onChange={e => setCliente({ ...cliente, uf: e.target.value.toUpperCase() })} maxLength={2} placeholder="Ex: ES" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
            </div>

            {/* Linha 5: Observações endereço */}
            <div>
              <Label className="text-xs font-bold text-slate-700">OBSERVAÇÕES</Label>
              <Input value={cliente.referencia} onChange={e => setCliente({ ...cliente, referencia: e.target.value.toUpperCase() })} placeholder="Tem algum ponto de referência?" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
            </div>

            {/* Linha 6: Condomínio, Bloco, AP */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8">
                <Label className="text-xs font-bold text-slate-700">CONDOMÍNIO</Label>
                <Input value={cliente.condominio} onChange={e => setCliente({ ...cliente, condominio: e.target.value.toUpperCase() })} placeholder="Digite aqui o nome do condomínio" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">BLOCO</Label>
                <Input value={cliente.bloco} onChange={e => setCliente({ ...cliente, bloco: e.target.value.toUpperCase() })} placeholder="Nº bloco" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">AP</Label>
                <Input value={cliente.apartamento} onChange={e => setCliente({ ...cliente, apartamento: e.target.value.toUpperCase() })} placeholder="Nº do AP" className="h-10 uppercase bg-white border-slate-300 rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEÇÃO 2: PRODUTOS — mesmo título (âmbar), busca padrão TOTAL, uma linha: busca + Adicionar + texto */}
        <Card className="border-2 border-amber-200/60 shadow-md bg-white/95 text-slate-800">
          <CardContent className="p-6 space-y-4">
            <div className="pt-1 pb-3">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
                <Package className="h-5 w-5" /> PRODUTOS
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-600" />
                <Input
                  placeholder="Buscar produto no estoque..."
                  value={buscaProduto}
                  onChange={e => setBuscaProduto(e.target.value)}
                  className="pl-9 h-10 rounded-lg border-2 border-amber-400/80 bg-amber-50/95 text-slate-800"
                />
                {produtosFiltrados.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border-2 border-amber-200 rounded-lg shadow-xl overflow-hidden">
                    {produtosFiltrados.map((p: any) => (
                      <div
                        key={p.id}
                        className={`p-2 cursor-pointer flex justify-between items-center border-b last:border-0 ${p.promoAtiva ? "bg-green-50 hover:bg-green-100" : "hover:bg-amber-50"}`}
                        onClick={() => adicionarProdutoCatalogo(p)}
                      >
                        <p className="font-bold text-sm uppercase">{p.descricao}</p>
                        <span className="text-xs font-semibold text-slate-600">{Number(p.valorVenda).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button
                type="button"
                className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMostrarLinhaAvulso(true);
                  setLinhaAvulso({ qtd: 1, desc: "", unit: "0,00" });
                  setTimeout(() => linhaAvulsoQtdRef.current?.focus(), 80);
                }}
                title="Focar na linha vazia para digitar outro item"
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
              <span className="text-sm text-slate-600">Adicione aqui um item avulso</span>
            </div>

            {/* Tabela: QTD | DESCRIÇÃO (desc+cor+opção em uma frase) | UNIT | TOTAL | Lixeira — divisões por coluna */}
            <div className="border-2 border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-100">
                  <tr className="border-b-2 border-slate-300">
                    <th className="p-2 text-center w-16 border-r border-slate-200">QTD</th>
                    <th className="p-2 text-left border-r border-slate-200">DESCRIÇÃO</th>
                    <th className="p-2 text-center w-28 border-r border-slate-200">UNIT</th>
                    <th className="p-2 text-center w-28 border-r border-slate-200">TOTAL</th>
                    <th className="p-2 text-center w-12"> </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {itens.map(item => (
                    <tr key={item.id} className="border-b border-slate-200 bg-white">
                      <td className="p-2 align-middle border-r border-slate-200 text-center">
                        <Input type="number" min={1} value={item.quantidade} onChange={e => atualizarItem(item.id, "quantidade", Number(e.target.value))} className="h-9 text-center w-14 mx-auto rounded-lg" />
                      </td>
                      <td className="p-2 align-middle border-r border-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold uppercase text-slate-900">{item.descricao}{item.corNome ? ` ${item.corNome}` : ""}</span>
                          <Select value={item.corId?.toString()} onValueChange={val => { const c = cores?.find((x: any) => x.id.toString() === val); atualizarItem(item.id, "corId", Number(val)); atualizarItem(item.id, "corNome", c?.nome); }}>
                            <SelectTrigger className="h-8 text-xs w-28 border-slate-300 rounded-lg">
                              <SelectValue placeholder="COR" />
                            </SelectTrigger>
                            <SelectContent>
                              {cores?.map((c: any) => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.nome.toUpperCase()}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {item.isPremio && <Badge className="text-[9px] bg-green-100 text-green-800 border-0">PRÊMIO</Badge>}
                          {!item.isPremio && item.tipo === "LIVRE" && <Badge variant="outline" className="text-[9px] bg-amber-100 border-amber-300 text-amber-800">AVULSO</Badge>}
                        </div>
                      </td>
                      <td className="p-2 align-middle border-r border-slate-200 text-center">
                        <Input
                          value={maskMoney(String(Math.round(item.valorUnitario * 100)))}
                          onChange={(e) => {
                            const next = parseMoney(maskMoney(e.target.value));
                            if (item.tipo === "CATALOGO" && (item.valorMinimo ?? 0) > next) {
                              atualizarItem(item.id, "valorUnitario", item.valorMinimo ?? 0);
                              toast({ title: "Preço mínimo", description: "Use DESCONTO no pedido se necessário.", variant: "destructive" });
                              return;
                            }
                            atualizarItem(item.id, "valorUnitario", next);
                          }}
                          className="h-9 text-center font-bold w-24 mx-auto rounded-lg"
                        />
                      </td>
                      <td className="p-2 text-center font-bold text-slate-900 align-middle border-r border-slate-200">{formatMoneyBRL(item.quantidade * item.valorUnitario)}</td>
                      <td className="p-2 text-center align-middle">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 rounded-lg" onClick={() => removerItem(item.id)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} title="Excluir linha (clique apenas)">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {mostrarLinhaAvulso && (
                    <tr className="border-b border-slate-200 bg-white">
                      <td className="p-2 align-middle border-r border-slate-200 text-center">
                        <Input
                          ref={linhaAvulsoQtdRef}
                          type="number"
                          min={1}
                          value={linhaAvulso.qtd}
                          onChange={e => setLinhaAvulso(prev => ({ ...prev, qtd: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); inputLinhaNovaRef.current?.focus(); } }}
                          className="h-9 text-center w-14 mx-auto rounded-lg border-2 border-slate-300 bg-white"
                        />
                      </td>
                      <td className="p-2 align-middle border-r border-slate-200">
                        <Input
                          ref={inputLinhaNovaRef}
                          placeholder="Descrição do item (Enter para UNIT)"
                          value={linhaAvulso.desc}
                          onChange={e => setLinhaAvulso(prev => ({ ...prev, desc: e.target.value.toUpperCase() }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              linhaAvulsoUnitRef.current?.focus();
                            }
                          }}
                          className="h-9 bg-white border-2 border-slate-300 rounded-lg text-slate-800 uppercase"
                        />
                      </td>
                      <td className="p-2 align-middle border-r border-slate-200 text-center">
                        <Input
                          ref={linhaAvulsoUnitRef}
                          value={linhaAvulso.unit}
                          onChange={e => setLinhaAvulso(prev => ({ ...prev, unit: maskMoney(e.target.value) }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              adicionarAvulsoDesdeLinha();
                            }
                          }}
                          className="h-9 text-center font-bold w-24 mx-auto rounded-lg border-2 border-slate-300 bg-white"
                        />
                      </td>
                      <td className="p-2 text-center font-bold text-slate-900 align-middle border-r border-slate-200">
                        {formatMoneyBRL(linhaAvulso.qtd * parseMoney(linhaAvulso.unit))}
                      </td>
                      <td className="p-2 text-center align-middle">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50 rounded-lg" onClick={() => { setMostrarLinhaAvulso(false); setLinhaAvulso({ qtd: 1, desc: "", unit: "0,00" }); }} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} title="Cancelar (clique apenas)">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        
{/* SEÇÃO 3: TOTAL DO PEDIDO — mesmo título (âmbar), respiro, máscaras alinhadas */}
<Card className="border-2 border-amber-200/60 shadow-md bg-white/95 text-slate-800">
  <CardContent className="p-6 space-y-5">
    <div className="pt-2 pb-2">
      <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
        <CircleDollarSign className="h-6 w-6" /> TOTAL DO PEDIDO
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
      <div className="space-y-1 flex flex-col items-center">
        <Label className="text-slate-700 text-xs font-bold">DESC</Label>
        <Input value={desconto} onChange={(e) => setDesconto(maskMoney(e.target.value))} className="h-10 text-center font-black tabular-nums rounded-lg border-2 border-amber-400/80 bg-amber-50/95 text-slate-800 w-full" />
      </div>
      <div className="space-y-1 flex flex-col items-center">
        <Label className="text-slate-700 text-xs font-bold">FRETE</Label>
        <Input value={frete} onChange={(e) => setFrete(maskMoney(e.target.value))} className="h-10 text-center font-black tabular-nums rounded-lg border-2 border-amber-400/80 bg-amber-50/95 text-slate-800 w-full" />
      </div>
      <div className="space-y-1 flex flex-col items-center">
        <Label className="text-slate-700 text-xs font-bold">SUBTOTAL</Label>
        <div className="h-10 rounded-lg border-2 border-amber-400/80 bg-amber-50/95 px-3 flex items-center justify-center font-black text-slate-800 tabular-nums w-full">
          {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </div>
      </div>
      <div className="space-y-1 flex flex-col items-center">
        <Label className="text-slate-700 text-xs font-bold">TOTAL</Label>
        <div className="h-10 rounded-lg border-2 border-amber-400/80 bg-amber-50/95 px-3 flex items-center justify-center font-black text-slate-800 tabular-nums w-full">
          {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </div>
      </div>
    </div>

    <div className="pt-4 space-y-3">
      <Label className="text-slate-700 text-sm font-bold">FORMA DE PAGAMENTO</Label>
      <div className="flex flex-wrap gap-5">
        {([
          { k: "PIX" as const, label: "PIX", Icon: Wallet, color: "text-emerald-600" },
          { k: "DINHEIRO" as const, label: "Dinheiro", Icon: Banknote, color: "text-amber-600" },
          { k: "CARTAO" as const, label: "Cartão", Icon: CreditCard, color: "text-blue-600" },
          { k: "BOLETO" as const, label: "Boleto", Icon: FileText, color: "text-orange-600" },
          { k: "A_DEFINIR" as const, label: "A definir", Icon: HelpCircle, color: "text-slate-600" },
        ]).map((opt) => {
          const ativo = pagamentoMetodos.includes(opt.k);
          return (
            <label key={opt.k} className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ativo}
                onChange={() => togglePagamento(opt.k)}
                className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              {opt.Icon ? <opt.Icon className={`h-6 w-6 ${opt.color}`} /> : <span className="w-6 h-6" aria-hidden />}
              <span className="text-base font-medium text-slate-800">{opt.label}</span>
            </label>
          );
        })}
      </div>
      <div className="pt-2 w-[45%]">
        <Label className="text-slate-700 text-sm font-bold">SELECIONADO</Label>
        <Input
          readOnly
          className="h-10 px-3 border-2 border-slate-300 rounded-lg text-sm uppercase bg-white text-slate-900 mt-1"
          value={pagamentoMetodos.length ? pagamentoMetodos.join(" + ") : "—"}
        />
      </div>
    </div>

    <div className="space-y-1">
      <Label className="text-slate-700 text-sm font-bold">OBSERVAÇÃO</Label>
      <Input
        className="h-10 px-3 border-2 border-slate-300 rounded-lg text-sm uppercase bg-white text-slate-900"
        value={observacoes}
        onChange={(e) => setObservacoes(e.target.value.toUpperCase())}
        placeholder="Coloca aqui informações sobre o pagamento"
      />
    </div>
  </CardContent>
</Card>

{/* BOTÕES DE AÇÃO */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="destructive"
            className="h-10 px-4 font-bold"
            onClick={() => {
              if (confirm("Deseja realmente cancelar este lançamento? Todos os dados serão perdidos.")) {
                setLocation("/");
              }
            }}
          >
            EXCLUIR
          </Button>

          <Button
            variant="outline"
            className="h-10 px-4 font-bold bg-blue-100 hover:bg-blue-200 text-blue-800 border-2 border-blue-300 hover:border-blue-400"
            onClick={() => {
              if (confirm("Deseja limpar para alterar os dados e lançar de novo?")) {
                limparFormulario();
              }
            }}
          >
            ALTERAR
          </Button>

          <Button
            className="h-10 px-4 font-bold bg-green-600 hover:bg-green-700"
            onClick={salvarPedido}
            disabled={loading}
          >
            {loading ? "SALVANDO..." : "SALVAR"}
          </Button>
        </div>
      </main>

      {/* DIALOG SUCESSO */}
      <Dialog open={dialogSucesso} onOpenChange={setDialogSucesso}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-6 w-6" /> PEDIDO REALIZADO!
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-2">
            <p className="text-lg font-bold">Pedido Nº {pedidoId} gerado com sucesso!</p>
            <p className="text-muted-foreground uppercase">Cliente: {cliente.nome}</p>
            <p className="text-2xl font-black text-primary">TOTAL: R$ {formatMoneyBRL(total)}</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                try {
                  if (!pedidoId) return;
                  toast({ title: "PDF", description: "Gerando PDF do pedido..." });
                  const dataUri = await gerarPDFPedido.mutateAsync({ id: pedidoId });
                  const numero = pedidoId ? String(pedidoId).padStart(4, "0") : "----";
                  const clienteSafe = String(cliente.nome || "CLIENTE")
                    .toUpperCase()
                    .replace(/[^A-Z0-9_\- ]/g, "")
                    .trim()
                    .replace(/\s+/g, "_")
                    .slice(0, 40);
                  downloadDataUri(String(dataUri), `PED-${numero}_${clienteSafe}.pdf`);
                  toast({ title: "Pronto", description: "PDF baixado. Se estiver no celular, ele vai para Downloads." });
                } catch (error: unknown) {
                  // Tipagem mais segura para o erro
                  let errorMessage = "Erro ao gerar PDF";
                  
                  if (error instanceof TRPCClientError) {
                    errorMessage = error.message;
                  } else if (error instanceof Error) {
                    errorMessage = error.message;
                  }
                  toast({ title: "Erro", description: errorMessage || "Falha ao gerar PDF", variant: "destructive" });
                }
              }}
            >
              BAIXAR PDF
            </Button>
            <Button className="w-full" onClick={() => setLocation('/meus-pedidos')}>VER MEUS PEDIDOS</Button>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => {
                limparFormulario();
              }}
            >
              NOVO PEDIDO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
