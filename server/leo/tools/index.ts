/**
 * Módulo de tools do LEO — registro centralizado por domínio.
 * clientes/, pedidos/, financeiro/, estoque/, analytics/
 */

import type { ToolDefinition } from "../agent/tool-registry.js";
import type { SecureToolContext } from "../../_core/secure-context.js";
import { secureRoleFromRequest } from "../../_core/secure-context.js";
import type { LeoToolContext } from "./types.js";
import { clientesTool, detalharClienteTool } from "./clientes/index.js";
import { buscarPedidoTool, listarPedidosTool, criarPedidoTool, verPedidoTool } from "./pedidos/index.js";
import { resumoFinanceiroTool, baixarPedidoTool, listarContasReceberTool } from "./financeiro/index.js";
import { estoqueTool, buscarProdutoTool } from "./estoque/index.js";
import { verCargasTool, verPedidosEntregaTool, verHistoricoRotaTool } from "./logistica/index.js";
import { analyticsToolList } from "./analytics/index.js";

const LEO_TOOLS = [
  clientesTool,
  detalharClienteTool,
  buscarPedidoTool,
  verPedidoTool,
  listarPedidosTool,
  criarPedidoTool,
  resumoFinanceiroTool,
  listarContasReceberTool,
  baixarPedidoTool,
  estoqueTool,
  buscarProdutoTool,
  verCargasTool,
  verPedidosEntregaTool,
  verHistoricoRotaTool,
  ...analyticsToolList,
];

function toRegistryContext(ctx: SecureToolContext): LeoToolContext {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userRole: ctx.userRole,
    vendedorId: ctx.vendedorId,
    role: ctx.role ?? secureRoleFromRequest(ctx.userRole, ctx.vendedorId),
  };
}

/**
 * Retorna definições no formato do toolRegistry (handler que chama execute e devolve resposta padronizada).
 */
export function getLeoToolDefinitions(): ToolDefinition[] {
  return LEO_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    handler: async (input: unknown, context: SecureToolContext) => {
      const result = await tool.execute(input as never, toRegistryContext(context));
      return result;
    },
  }));
}

export { clientesTool, detalharClienteTool } from "./clientes/index.js";
export { buscarPedidoTool, listarPedidosTool, criarPedidoTool, verPedidoTool } from "./pedidos/index.js";
export { resumoFinanceiroTool, baixarPedidoTool, listarContasReceberTool } from "./financeiro/index.js";
export { estoqueTool, buscarProdutoTool } from "./estoque/index.js";
export { verCargasTool, verPedidosEntregaTool, verHistoricoRotaTool } from "./logistica/index.js";
export type { LeoToolContext, LeoToolResponse, LeoToolDefinition } from "./types.js";
export { createToolResponse, type ToolResponse } from "./tool-response.js";
