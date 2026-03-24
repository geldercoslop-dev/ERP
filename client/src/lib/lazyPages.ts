import { lazy } from "react";

// Lazy loading de páginas
export const pages = {
  // Públicas
  Login: lazy(() => import("../pages/Login")),
  DebugAuth: lazy(() => import("../pages/DebugAuth")),
  
  // Principais
  Dashboard: lazy(() => import("../pages/Dashboard")),
  Home: lazy(() => import("../pages/Home")),
  NovaVenda: lazy(() => import("../pages/NovaVenda")),
  Vendas: lazy(() => import("../pages/Vendas")),
  Clientes: lazy(() => import("../pages/Clientes")),
  Produtos: lazy(() => import("../pages/Produtos")),
  Estoque: lazy(() => import("../pages/Estoque")),
  
  // Financeiro
  Financeiro: lazy(() => import("../pages/Financeiro")),
  FinanceiroAi: lazy(() => import("../pages/FinanceiroAi")),
  ContasReceber: lazy(() => import("../pages/ContasReceber")),
  ContasPagar: lazy(() => import("../pages/ContasPagar")),
  Boletos: lazy(() => import("../pages/FinanceiroBoletos")),
  HistoricoCaixa: lazy(() => import("../pages/HistoricoCaixa")),
  PlanoContas: lazy(() => import("../pages/PlanoContas")),
  ContasFixas: lazy(() => import("../pages/ContasFixas")),
  
  // Vendedores
  Vendedores: lazy(() => import("../pages/Vendedores")),
  Comissao: lazy(() => import("../pages/MinhasComissoes")),
  
  // Logística
  Cargas: lazy(() => import("../pages/Cargas")),
  CargaDetalhes: lazy(() => import("../pages/CargaDetalhes")),
  CargaBaixa: lazy(() => import("../pages/CargaBaixa")),
  Logistica: lazy(() => import("../pages/Logistica")),
  LogisticaCarga: lazy(() => import("../pages/LogisticaCarga")),
  LogisticaMapa: lazy(() => import("../pages/LogisticaMapa")),
  LogisticaHistorico: lazy(() => import("../pages/LogisticaHistorico")),
  LogisticaRelatorioViagem: lazy(() => import("../pages/LogisticaRelatorioViagem")),
  
  // Produtos e Cadastros
  Cadastros: lazy(() => import("../pages/Cadastros")),
  GruposPrecificacao: lazy(() => import("../pages/GruposPrecificacao")),
  Cores: lazy(() => import("../pages/Cores")),
  Promocoes: lazy(() => import("../pages/Promocoes")),
  NotaEntrada: lazy(() => import("../pages/NotaEntrada")),
  
  // Relatórios
  Relatorios: lazy(() => import("../pages/Relatorios")),
  
  // Assistente LEO
  Assistente: lazy(() => import("../pages/Assistente")),
  LeoDashboard: lazy(() => import("../pages/LeoDashboard")),
  LeoPanel: lazy(() => import("../pages/LeoPanel")),
  
  // Pedidos
  MeusPedidos: lazy(() => import("../pages/MeusPedidos")),
  Pendencias: lazy(() => import("../pages/Pendencias")),
  ConferenciaPedidos: lazy(() => import("../pages/ConferenciaPedidos")),
  PedidoCompra: lazy(() => import("../pages/PedidoCompra")),
  
  // Admin
  Diagnostico: lazy(() => import("../pages/Diagnostico")),
  Auditoria: lazy(() => import("../pages/Auditoria")),
  ConfiguracoesBanco: lazy(() => import("../pages/ConfiguracoesBanco")),
  SystemHealth: lazy(() => import("../pages/SystemHealth")),
  ControlPanel: lazy(() => import("../pages/ControlPanel")),
  
  // 404
  NotFound: lazy(() => import("../pages/NotFound")),
} as const;
