import React from "react";
import { Route, Redirect } from "wouter";
import { pages } from "./lazyPages";
import AppShell from "../components/layout/AppShell";
import { useAuthStore } from "../store/authStore";
import { LoadingState } from "../components/ui/perf/StatusStates";
import { isAuthenticatedForRoute } from "./security/routeGuards";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const gate = isAuthenticatedForRoute(isLoading, isAuthenticated);

  if (gate === "loading") {
    return <LoadingFallback />;
  }
  if (gate === "denied") {
    return <Redirect to={`/login?force=true&t=${Date.now()}`} />;
  }

  return <AppShell>{children}</AppShell>;
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "admin") return <Redirect to="/" />;
  return <>{children}</>;
}

export function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <LoadingState message="Inicializando GRS ERP..." />
    </div>
  );
}

export function PublicRoutes() {
  return (
    <>
      <Route path="/login" component={pages.Login} />
      <Route path="/debug-auth">
        {import.meta.env.DEV ? <pages.DebugAuth /> : <Redirect to="/" />}
      </Route>
    </>
  );
}

export function AdminRoutes() {
  return (
    <>
      <Route path="/diagnostico">
        <ProtectedShell>
          <AdminOnly><pages.Diagnostico /></AdminOnly>
        </ProtectedShell>
      </Route>
      <Route path="/auditoria">
        <ProtectedShell>
          <AdminOnly><pages.Auditoria /></AdminOnly>
        </ProtectedShell>
      </Route>
      <Route path="/relatorios">
        <ProtectedShell><AdminOnly><pages.Relatorios /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/plano-contas">
        <ProtectedShell><AdminOnly><pages.PlanoContas /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/contas-fixas">
        <ProtectedShell><AdminOnly><pages.ContasFixas /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/financeiro/historico">
        <ProtectedShell><AdminOnly><pages.HistoricoCaixa /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/financeiro">
        <ProtectedShell><AdminOnly><pages.FinanceiroAi /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/financeiro/comissoes">
        <ProtectedShell><AdminOnly><pages.Financeiro /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/contas-receber">
        <ProtectedShell><AdminOnly><pages.ContasReceber /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/contas-pagar">
        <ProtectedShell><AdminOnly><pages.ContasPagar /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/configuracoes-banco">
        <ProtectedShell><AdminOnly><pages.ConfiguracoesBanco /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/system-health">
        <ProtectedShell><AdminOnly><pages.SystemHealth /></AdminOnly></ProtectedShell>
      </Route>
      <Route path="/control-panel">
        <ProtectedShell><AdminOnly><pages.ControlPanel /></AdminOnly></ProtectedShell>
      </Route>
    </>
  );
}

export function MainRoutes() {
  return (
    <>
      <Route path="/">
        <ProtectedShell><pages.Home /></ProtectedShell>
      </Route>
      <Route path="/nova-venda">
        <ProtectedShell><pages.NovaVenda /></ProtectedShell>
      </Route>
      <Route path="/vendas">
        <ProtectedShell><pages.Vendas /></ProtectedShell>
      </Route>
      <Route path="/clientes">
        <ProtectedShell><pages.Clientes /></ProtectedShell>
      </Route>
      <Route path="/produtos">
        <ProtectedShell><pages.Produtos /></ProtectedShell>
      </Route>
      <Route path="/estoque">
        <ProtectedShell><pages.Estoque /></ProtectedShell>
      </Route>
      <Route path="/comissao">
        <ProtectedShell><pages.Comissao /></ProtectedShell>
      </Route>
      <Route path="/boletos">
        <ProtectedShell><pages.Boletos /></ProtectedShell>
      </Route>
      <Route path="/vendedores">
        <ProtectedShell><pages.Vendedores /></ProtectedShell>
      </Route>
    </>
  );
}

export function LogisticsRoutes() {
  return (
    <>
      <Route path="/logistica/relatorio-viagem">
        <ProtectedShell><pages.LogisticaRelatorioViagem /></ProtectedShell>
      </Route>
      <Route path="/logistica/historico">
        <ProtectedShell><pages.LogisticaHistorico /></ProtectedShell>
      </Route>
      <Route path="/logistica/mapa/:id">
        <ProtectedShell><pages.LogisticaMapa /></ProtectedShell>
      </Route>
      <Route path="/logistica/mapa">
        <ProtectedShell><pages.LogisticaMapa /></ProtectedShell>
      </Route>
      <Route path="/logistica/carga">
        <ProtectedShell><pages.LogisticaCarga /></ProtectedShell>
      </Route>
      <Route path="/logistica">
        <ProtectedShell><pages.Logistica /></ProtectedShell>
      </Route>
      <Route path="/cargas/:id/baixa">
        <ProtectedShell><pages.CargaBaixa /></ProtectedShell>
      </Route>
      <Route path="/cargas/:id">
        <ProtectedShell><pages.CargaDetalhes /></ProtectedShell>
      </Route>
      <Route path="/cargas">
        <ProtectedShell><pages.Cargas /></ProtectedShell>
      </Route>
    </>
  );
}

export function CadastrosRoutes() {
  return (
    <>
      <Route path="/cadastros">
        <ProtectedShell><pages.Cadastros /></ProtectedShell>
      </Route>
      <Route path="/grupos-precificacao">
        <ProtectedShell><pages.GruposPrecificacao /></ProtectedShell>
      </Route>
      <Route path="/cores">
        <ProtectedShell><pages.Cores /></ProtectedShell>
      </Route>
      <Route path="/promocoes">
        <ProtectedShell><pages.Promocoes /></ProtectedShell>
      </Route>
      <Route path="/nota-entrada">
        <ProtectedShell><pages.NotaEntrada /></ProtectedShell>
      </Route>
    </>
  );
}

export function AssistantRoutes() {
  return (
    <>
      <Route path="/assistente">
        <ProtectedShell><pages.Assistente /></ProtectedShell>
      </Route>
      <Route path="/leo-dashboard">
        <ProtectedShell><pages.LeoDashboard /></ProtectedShell>
      </Route>
      <Route path="/leo">
        <ProtectedShell><pages.LeoPanel /></ProtectedShell>
      </Route>
    </>
  );
}

export function OrdersRoutes() {
  return (
    <>
      <Route path="/meus-pedidos">
        <ProtectedShell><pages.MeusPedidos /></ProtectedShell>
      </Route>
      <Route path="/pendencias">
        <ProtectedShell><pages.Pendencias /></ProtectedShell>
      </Route>
      <Route path="/conferencia">
        <ProtectedShell><pages.ConferenciaPedidos /></ProtectedShell>
      </Route>
      <Route path="/pedido-compra">
        <ProtectedShell><pages.PedidoCompra /></ProtectedShell>
      </Route>
    </>
  );
}

export function NotFoundRoute() {
  return (
    <Route>
      <ProtectedShell><pages.NotFound /></ProtectedShell>
    </Route>
  );
}
