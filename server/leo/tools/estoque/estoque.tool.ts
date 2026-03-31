import { z } from "zod";
import * as inventoryService from "../../../services/inventory.service.js";
import type { LeoToolContext, LeoToolDefinition } from "../types.js";
import { createToolResponse } from "../tool-response.js";

const inputSchema = z.object({
  nome: z.string().optional().describe("Filtro por nome/descrição do produto"),
  limit: z.number().optional().default(10),
});

type Input = z.infer<typeof inputSchema>;

async function execute(input: Input, context: LeoToolContext) {
  const { tenantId } = context;
  const limit = input.limit ?? 10;

  const todos = await inventoryService.getAllProdutosComPrecoVigente(tenantId, new Date());
  let produtos = todos;

  if (input.nome?.trim()) {
    const term = input.nome.trim().toLowerCase();
    produtos = todos.filter(
      (p: { descricao?: string }) => String(p.descricao || "").toLowerCase().includes(term)
    );
  }
  produtos = produtos.slice(0, limit);

  return createToolResponse(
    true,
    produtos.length > 0 ? `Encontrei ${produtos.length} produto(s).` : "Nenhum produto encontrado.",
    produtos,
    { tool: "listar_estoque", count: produtos.length }
  );
}

export const estoqueTool: LeoToolDefinition<Input> = {
  name: "listar_estoque",
  description: "Lista produtos em estoque; opcionalmente filtra por nome/descrição",
  inputSchema,
  execute,
};

const buscarProdutoInput = z.object({
  produtoId: z.number().describe("ID do produto"),
});

type BuscarProdutoInput = z.infer<typeof buscarProdutoInput>;

export const buscarProdutoTool: LeoToolDefinition<BuscarProdutoInput> = {
  name: "buscar_produto",
  description: "Busca um produto do catálogo por ID (leitura)",
  inputSchema: buscarProdutoInput,
  async execute(input, context) {
    const { tenantId } = context;
    const row = await inventoryService.getProdutoById(tenantId, input.produtoId);
    return createToolResponse(
      !!row,
      row ? "Produto encontrado." : "Produto não encontrado.",
      row ?? null,
      { tool: "buscar_produto" }
    );
  },
};
