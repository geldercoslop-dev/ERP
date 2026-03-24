/**
 * Módulo de tools do LEO — registro centralizado por domínio.
 * clientes/, pedidos/, financeiro/, estoque/, analytics/
 */

import type { ToolDefinition } from "../agent/tool-registry";
import type { SecureToolContext } from "../../_core/secure-context";
import { secureRoleFromRequest } from "../../_core/secure-context";
import type { LeoToolContext } from "./types";
import { clientesTool, detalharClienteTool } from "./clientes";
import { buscarPedidoTool, listarPedidosTool, criarPedidoTool, verPedidoTool } from "./pedidos";
import { resumoFinanceiroTool, baixarPedidoTool, listarContasReceberTool } from "./financeiro";
import { estoqueTool, buscarProdutoTool } from "./estoque";
import { verCargasTool, verPedidosEntregaTool, verHistoricoRotaTool } from "./logistica";
import { analyticsToolList } from "./analytics";

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

export { clientesTool, detalharClienteTool } from "./clientes";
export { buscarPedidoTool, listarPedidosTool, criarPedidoTool, verPedidoTool } from "./pedidos";
export { resumoFinanceiroTool, baixarPedidoTool, listarContasReceberTool } from "./financeiro";
export { estoqueTool, buscarProdutoTool } from "./estoque";
export { verCargasTool, verPedidosEntregaTool, verHistoricoRotaTool } from "./logistica";
export type { LeoToolContext, LeoToolResponse, LeoToolDefinition } from "./types";
export { createToolResponse, type ToolResponse } from "./tool-response";
