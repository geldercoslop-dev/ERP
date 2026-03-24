/** Dados fictícios para dashboard até integração com API. */
export const MOCK_TOTAL_VENDAS = 128;
export const MOCK_TOTAL_CLIENTES = 342;
export const MOCK_FATURAMENTO_MES = 184_520.75;

export const MOCK_VENDAS_RECENTES = [
  { id: "v1", clienteNome: "Maria Silva", valor: 3200, data: "2025-03-18" },
  { id: "v2", clienteNome: "João Souza", valor: 1580.5, data: "2025-03-19" },
  { id: "v3", clienteNome: "Loja Central", valor: 9200, data: "2025-03-20" },
] as const;
