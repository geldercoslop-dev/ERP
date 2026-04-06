/**
 * Gateway de serviços do LEO.
 *
 * Mantém um ponto único de acesso para o ecossistema LEO, mas agora delega para
 * services de domínio em vez de expor conexão/objetos de DB.
 */
export async function getLeoDomainServices() {
  const [ordersService, inventoryService, financeService] = await Promise.all([
    import("../orders.service.js"),
    import("../inventory.service.js"),
    import("../finance.service.js"),
  ]);
  return {
    ordersService,
    inventoryService,
    financeService,
  };
}
