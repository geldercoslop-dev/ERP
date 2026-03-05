import { Request } from 'express';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  listPromocoes,
  createPromocao,
  updatePromocao,
  deletePromocao,
  getPromocaoItens,
  setPromocaoItens,
} from '../db';

export async function listar(_req: Request) {
  try {
    const promocoes = await listPromocoes();
    return { promocoes };
  } catch (e) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao listar promoções' });
  }
}

export async function detalhes(request: Request) {
  try {
    const { id } = request.params as { id: string };
    const itens = await getPromocaoItens(Number(id));
    return { itens };
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao buscar itens da promoção' });
  }
}

export async function criar(request: Request) {
  try {
    const body = z.object({
      nome: z.string().min(2),
      inicio: z.coerce.date(),
      fim: z.coerce.date(),
      ativo: z.boolean().optional(),
      itens: z.array(
        z.object({ produtoId: z.number().min(1), precoPromocional: z.coerce.number().min(0) })
      ).default([]),
    }).parse(request.body);

    if (body.fim < body.inicio) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data fim não pode ser menor que início' });
    }

    const created = await createPromocao({ nome: body.nome, inicio: body.inicio, fim: body.fim, ativo: body.ativo });
    await setPromocaoItens(created.id, body.itens);
    return { id: created.id };
  } catch (e: any) {
    if (e instanceof z.ZodError) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar promoção' });
  }
}

export async function atualizar(request: Request) {
  try {
    const { id } = request.params as { id: string };
    const body = z.object({
      nome: z.string().min(2).optional(),
      inicio: z.coerce.date().optional(),
      fim: z.coerce.date().optional(),
      ativo: z.boolean().optional(),
      itens: z.array(
        z.object({ produtoId: z.number().min(1), precoPromocional: z.coerce.number().min(0) })
      ).optional(),
    }).parse(request.body);

    if (body.inicio && body.fim && body.fim < body.inicio) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data fim não pode ser menor que início' });
    }

    await updatePromocao(Number(id), {
      nome: body.nome,
      inicio: body.inicio,
      fim: body.fim,
      ativo: body.ativo,
    } as any);

    if (body.itens) {
      await setPromocaoItens(Number(id), body.itens);
    }
    return { ok: true };
  } catch (e: any) {
    if (e instanceof z.ZodError) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Dados inválidos' });
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar promoção' });
  }
}

export async function remover(request: Request) {
  try {
    const { id } = request.params as { id: string };
    await deletePromocao(Number(id));
    return { ok: true };
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao remover promoção' });
  }
}
