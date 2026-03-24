import { Request } from 'express';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createProduto as dbCreateProduto,
  updateProduto as dbUpdateProduto,
  deleteProduto as dbDeleteProduto,
  getProdutoById as dbGetProdutoById,
  getAllProdutosComPrecoVigente,
  updateEstoqueProduto,
} from '../db/index';

function requireTenantFromRequest(req: Request): number {
  const raw =
    (req as any).tenantId ??
    (typeof req.headers?.['x-tenant-id'] === 'string' ? Number(req.headers['x-tenant-id']) : undefined);
  const tenantId = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Tenant ID obrigatório' });
  }
  return tenantId;
}

const preprocessEstoque = z.preprocess(
  (v) => (v === '' || v == null ? 0 : typeof v === 'string' ? Number(v) : v),
  z.number().int().min(0).refine((n) => !Number.isNaN(n), { message: 'Estoque inválido' })
);

const createSchema = z.object({
  descricao: z.string().min(2),
  marca: z.string().optional().nullable(),
  fornecedor: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  custo: z.coerce.number().min(0),
  descontoFabrica: z.coerce.number().min(0).optional(),
  ipi: z.coerce.number().min(0).optional(),
  frete: z.coerce.number().min(0).optional(),
  montagem: z.coerce.number().min(0).optional(),
  lucro: z.coerce.number().min(0).optional(),
  comissao: z.coerce.number().min(0).optional(),
  jurosCartao: z.coerce.number().min(0).optional(),
  valorVenda: z.coerce.number().min(0),
  prazoGarantia: z.coerce.number().min(0).default(90),
  grupoId: z.number().optional(),
  ativo: z.boolean().optional(),
  // Variações
  cores: z.array(z.object({ corId: z.number().min(1), estoque: preprocessEstoque })).optional(),
  variacoes: z.array(z.object({
    tamanho: z.string().optional().default(''),
    temEspelho: z.boolean().default(false),
    acrescimoCusto: z.coerce.number().min(0).default(0),
    estoque: preprocessEstoque.default(0),
  })).optional(),
});

const updateSchema = createSchema.partial();

export async function getProdutos(_req: Request) {
  try {
    const tenantId = requireTenantFromRequest(_req);
    const produtos = await getAllProdutosComPrecoVigente(tenantId, new Date());
    return { produtos, total: produtos.length };
  } catch (e) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar produtos' });
  }
}

export async function getProdutoById(request: Request) {
  try {
    const tenantId = requireTenantFromRequest(request);
    const { id } = request.params as { id: string };
    const produto = await dbGetProdutoById(tenantId, Number(id));
    if (!produto) throw new TRPCError({ code: 'NOT_FOUND', message: 'Produto não encontrado' });
    return produto;
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar produto' });
  }
}

export async function createProduto(request: Request) {
  try {
    const tenantId = requireTenantFromRequest(request);
    const data = createSchema.parse(request.body);
    const estoqueCores = (data.cores || []).reduce((s, c) => s + Number(c.estoque || 0), 0);
    const estoqueVar = (data.variacoes || []).reduce((s, v) => s + Number(v.estoque || 0), 0);
    const estoqueTotal = estoqueCores + estoqueVar;
    const result = await dbCreateProduto(tenantId, {
      descricao: data.descricao,
      marca: data.marca ?? undefined,
      fornecedor: data.fornecedor ?? undefined,
      categoria: data.categoria ?? undefined,
      custo: data.custo.toFixed(2),
      descontoFabrica: (data.descontoFabrica ?? 0).toFixed(2),
      ipi: (data.ipi ?? 0).toFixed(2),
      frete: (data.frete ?? 0).toFixed(2),
      montagem: (data.montagem ?? 0).toFixed(2),
      lucro: (data.lucro ?? 0).toFixed(2),
      comissao: (data.comissao ?? 0).toFixed(2),
      jurosCartao: (data.jurosCartao ?? 0).toFixed(2),
      valorVenda: data.valorVenda.toFixed(2),
      estoque: estoqueTotal,
      prazoGarantia: data.prazoGarantia,
      grupoId: data.grupoId,
      ativo: data.ativo ?? true,
      cores: data.cores,
      variacoes: data.variacoes,
    } as any);
    return { message: 'Produto criado', produto: result };
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    }
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar produto' });
  }
}

export async function updateProduto(request: Request) {
  try {
    const tenantId = requireTenantFromRequest(request);
    const { id } = request.params as { id: string };
    const data = updateSchema.parse(request.body);
    // Remove campos que não são colunas diretas (evita update quebrar)
    const { cores, variacoes, ...rest } = data as any;
    const patch: any = { ...rest };
    if (data.custo !== undefined) patch.custo = Number(data.custo).toFixed(2);
    if (data.valorVenda !== undefined) patch.valorVenda = Number(data.valorVenda).toFixed(2);
    await dbUpdateProduto(tenantId, Number(id), patch);
    return { message: 'Produto atualizado' };
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    }
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar produto' });
  }
}

export async function deleteProduto(request: Request) {
  try {
    const tenantId = requireTenantFromRequest(request);
    const { id } = request.params as { id: string };
    await dbDeleteProduto(tenantId, Number(id));
    return { message: 'Produto removido' };
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao remover produto' });
  }
}

export async function buscarProdutos(request: Request) {
  try {
    const tenantId = requireTenantFromRequest(request);
    const { query } = request.query as { query?: string };
    const produtos = await getAllProdutosComPrecoVigente(tenantId, new Date());
    if (!query) return { produtos, total: produtos.length };
    const termo = query.toLowerCase();
    const filtrados = produtos.filter((p: any) =>
      p.descricao?.toLowerCase().includes(termo) ||
      p.marca?.toLowerCase().includes(termo) ||
      p.categoria?.toLowerCase().includes(termo)
    );
    return { produtos: filtrados, total: filtrados.length };
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar produtos' });
  }
}

export async function atualizarEstoque(request: Request) {
  try {
    const tenantId = requireTenantFromRequest(request);
    const { id } = request.params as { id: string };
    const body = z.object({
      quantidade: z.preprocess(
        (v) => (v === '' || v == null ? 0 : typeof v === 'string' ? Number(v) : v),
        z.number().int().min(0).refine((n) => !Number.isNaN(n), { message: 'Quantidade inválida' })
      ),
      tipo: z.enum(['entrada', 'saida']),
    }).parse(request.body);
    const qtd = body.tipo === 'entrada' ? body.quantidade : -body.quantidade;
    await updateEstoqueProduto(tenantId, Number(id), qtd);
    return { message: 'Estoque atualizado' };
  } catch (e: any) {
    if (e instanceof z.ZodError) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    if (e?.code === 'ESTOQUE_NEGATIVO' || e?.code === 'ESTOQUE_INSUFICIENTE') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message ?? 'Estoque insuficiente para esta operação.' });
    }
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar estoque' });
  }
}

export async function verificarEstoqueBaixo(_req: Request) {
  try {
    const tenantId = requireTenantFromRequest(_req);
    // Mantido por compatibilidade (pode evoluir depois).
    const produtos = await getAllProdutosComPrecoVigente(tenantId, new Date());
    const baixo = produtos.filter((p: any) => Number(p.estoque) <= 0);
    return { produtos: baixo, total: baixo.length };
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao verificar estoque baixo' });
  }
}
