import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createProduto as dbCreateProduto,
  updateProduto as dbUpdateProduto,
  deleteProduto as dbDeleteProduto,
  getProdutoById as dbGetProdutoById,
  getAllProdutosComPrecoVigente,
  updateEstoqueProduto,
} from '../db';

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
  cores: z.array(z.object({ corId: z.number().min(1), estoque: z.coerce.number().min(0) })).optional(),
  variacoes: z.array(z.object({
    tamanho: z.string().optional().default(''),
    temEspelho: z.boolean().default(false),
    acrescimoCusto: z.coerce.number().min(0).default(0),
    estoque: z.coerce.number().min(0).default(0),
  })).optional(),
});

const updateSchema = createSchema.partial();

export async function getProdutos(_req: Request, reply: Response) {
  try {
    const produtos = await getAllProdutosComPrecoVigente(new Date());
    return { produtos, total: produtos.length };
  } catch (e) {
    return reply.status(500).send({ error: 'Erro ao buscar produtos' });
  }
}

export async function getProdutoById(request: Request, reply: Response) {
  try {
    const { id } = request.params as { id: string };
    const produto = await dbGetProdutoById(Number(id));
    if (!produto) return reply.status(404).send({ error: 'Produto não encontrado' });
    return produto;
  } catch (e) {
    return reply.status(500).send({ error: 'Erro ao buscar produto' });
  }
}

export async function createProduto(request: Request, reply: Response) {
  try {
    const data = createSchema.parse(request.body);
    const estoqueCores = (data.cores || []).reduce((s, c) => s + Number(c.estoque || 0), 0);
    const estoqueVar = (data.variacoes || []).reduce((s, v) => s + Number(v.estoque || 0), 0);
    const estoqueTotal = estoqueCores + estoqueVar;
    const result = await dbCreateProduto({
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
    return reply.status(201).send({ message: 'Produto criado', produto: result });
  } catch (e: any) {
    if (e instanceof z.ZodError) return reply.status(400).send({ error: 'Dados inválidos', details: e.issues });
    return reply.status(500).send({ error: 'Erro ao criar produto' });
  }
}

export async function updateProduto(request: Request, reply: Response) {
  try {
    const { id } = request.params as { id: string };
    const data = updateSchema.parse(request.body);
    // Remove campos que não são colunas diretas (evita update quebrar)
    const { cores, variacoes, ...rest } = data as any;
    const patch: any = { ...rest };
    if (data.custo !== undefined) patch.custo = Number(data.custo).toFixed(2);
    if (data.valorVenda !== undefined) patch.valorVenda = Number(data.valorVenda).toFixed(2);
    await dbUpdateProduto(Number(id), patch);
    return reply.status(200).send({ message: 'Produto atualizado' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return reply.status(400).send({ error: 'Dados inválidos', details: e.issues });
    return reply.status(500).send({ error: 'Erro ao atualizar produto' });
  }
}

export async function deleteProduto(request: Request, reply: Response) {
  try {
    const { id } = request.params as { id: string };
    await dbDeleteProduto(Number(id));
    return reply.status(200).send({ message: 'Produto removido' });
  } catch (e) {
    return reply.status(500).send({ error: 'Erro ao remover produto' });
  }
}

export async function buscarProdutos(request: Request, reply: Response) {
  try {
    const { query } = request.query as { query?: string };
    const produtos = await getAllProdutosComPrecoVigente(new Date());
    if (!query) return { produtos, total: produtos.length };
    const termo = query.toLowerCase();
    const filtrados = produtos.filter((p: any) =>
      p.descricao?.toLowerCase().includes(termo) ||
      p.marca?.toLowerCase().includes(termo) ||
      p.categoria?.toLowerCase().includes(termo)
    );
    return { produtos: filtrados, total: filtrados.length };
  } catch (e) {
    return reply.status(500).send({ error: 'Erro ao buscar produtos' });
  }
}

export async function atualizarEstoque(request: Request, reply: Response) {
  try {
    const { id } = request.params as { id: string };
    const body = z.object({ quantidade: z.coerce.number(), tipo: z.enum(['entrada', 'saida']) }).parse(request.body);
    const qtd = body.tipo === 'entrada' ? body.quantidade : -body.quantidade;
    await updateEstoqueProduto(Number(id), qtd);
    return reply.status(200).send({ message: 'Estoque atualizado' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return reply.status(400).send({ error: 'Dados inválidos', details: e.issues });
    if (e?.code === 'ESTOQUE_NEGATIVO' || e?.code === 'ESTOQUE_INSUFICIENTE') {
      return reply.status(400).send({ error: 'Estoque insuficiente', message: e?.message ?? 'Estoque insuficiente para esta operação.' });
    }
    return reply.status(500).send({ error: 'Erro ao atualizar estoque' });
  }
}

export async function verificarEstoqueBaixo(_req: Request, reply: Response) {
  try {
    // Mantido por compatibilidade (pode evoluir depois).
    const produtos = await getAllProdutosComPrecoVigente(new Date());
    const baixo = produtos.filter((p: any) => Number(p.estoque) <= 0);
    return { produtos: baixo, total: baixo.length };
  } catch (e) {
    return reply.status(500).send({ error: 'Erro ao verificar estoque baixo' });
  }
}
