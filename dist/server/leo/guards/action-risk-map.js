/**
 * Action Risk Map - Mapeamento de ações para níveis de risco
 *
 * Define quais ações precisam de confirmação antes da execução.
 * Ações HIGH são bloqueadas até confirmação explícita.
 */
export const actionRiskMap = {
    // Ações LOW - Consulta/Leitura (executam direto)
    gerar_relatorio: "LOW",
    buscar_pedido: "LOW",
    listar_clientes: "LOW",
    listar_produtos: "LOW",
    consultar_estoque: "LOW",
    verificar_status: "LOW",
    obter_resumo: "LOW",
    pesquisar: "LOW",
    consulta: "LOW",
    // Ações HIGH - Escrita/Modificação (requerem confirmação)
    baixar_pedido: "HIGH",
    alterar_pedido: "HIGH",
    criar_pedido: "HIGH",
    cancelar_pedido: "HIGH",
    alterar_estoque: "HIGH",
    movimentar_estoque: "HIGH",
    ajustar_estoque: "HIGH",
    criar_conta: "HIGH",
    pagar_conta: "HIGH",
    alterar_conta: "HIGH",
    cancelar_conta: "HIGH",
    processar_pagamento: "HIGH",
    registrar_venda: "HIGH",
    emitir_nota: "HIGH",
    calcular_comissao: "HIGH",
    operacao_erp: "HIGH",
    operacao_sistema: "HIGH",
    automacao: "HIGH",
};
