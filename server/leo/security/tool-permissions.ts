/**
 * Permissões por tool do LEO — mapa simples por role.
 * Nomes alinhados ao tool-registry (tools modulares em snake_case).
 */

export type ToolPermissionResult =
  | { allowed: true }
  | { allowed: false; message: string };

const toolPermissions: Record<string, string[]> = {
  buscar_cliente: ["admin", "vendedor", "user"],
  detalhar_cliente: ["admin", "vendedor", "user"],
  buscar_pedido: ["admin", "vendedor", "user"],
  ver_pedido: ["admin", "vendedor", "user"],
  listar_pedidos: ["admin", "vendedor", "user"],
  criar_pedido: ["admin", "vendedor", "user"],
  resumo_financeiro: ["admin", "vendedor", "user"],
  listar_contas_receber: ["admin", "vendedor", "user"],
  baixar_pedido: ["admin", "vendedor"],
  listar_estoque: ["admin", "vendedor", "user"],
  buscar_produto: ["admin", "vendedor", "user"],
  ver_cargas: ["admin", "vendedor", "user"],
  ver_pedidos_entrega: ["admin", "vendedor", "user"],
  ver_historico_rota: ["admin", "vendedor", "user"],
  deletarCliente: ["admin"],
  open_app: ["admin"],
  close_app: ["admin"],
  open_browser: ["admin"],
  run_terminal_command: ["admin"],
  write_file: ["admin"],
};

/**
 * Verifica se o userRole pode executar a tool.
 * Retorna { allowed: true } ou { allowed: false, message }.
 */
export function checkToolPermission(tool: string, userRole: string | undefined): ToolPermissionResult {
  const roles = toolPermissions[tool];
  const role = (userRole || "user").toLowerCase();
  if (!roles) {
    return { allowed: false, message: "Tool não registrada no sistema de permissões" };
  }
  if (roles.some((r) => r.toLowerCase() === role)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    message: "Permissão insuficiente",
  };
}
