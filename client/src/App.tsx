import React, { Suspense } from "react";
import { Route, Switch, Redirect } from "wouter";
import { AuthInitializer } from "@/components/AuthInitializer";
import { ErrorHandler } from "@/components/ErrorHandler";
import { ConnectionDebugger } from "@/components/ConnectionDebugger";
import { SessionExpiredBridge } from "@/components/SessionExpiredBridge";
import { PageRouteSkeleton } from "@/components/ui/PageRouteSkeleton";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { useRequireAdmin } from "@/hooks/useRouteAccess";

import { lazy } from "react";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Estoque = lazy(() => import("./pages/Estoque"));
const NovaVenda = lazy(() => import("./pages/NovaVenda"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Entregas = lazy(() => import("./pages/Entregas"));
const Comissao = lazy(() => import("./pages/MinhasComissoes"));
const Boletos = lazy(() => import("./pages/FinanceiroBoletos"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const PlanoContas = lazy(() => import("./pages/PlanoContas"));
const ContasFixas = lazy(() => import("./pages/ContasFixas"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Vendedores = lazy(() => import("./pages/Vendedores"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const Cargas = lazy(() => import("./pages/Cargas"));
const NotaEntrada = lazy(() => import("./pages/NotaEntrada"));
const Promocoes = lazy(() => import("./pages/Promocoes"));
const Vendas = lazy(() => import("./pages/Vendas"));
const MeusPedidos = lazy(() => import("./pages/MeusPedidos"));
const CargaDetalhes = lazy(() => import("./pages/CargaDetalhes"));
const CargaBaixa = lazy(() => import("./pages/CargaBaixa"));
const Pendencias = lazy(() => import("./pages/Pendencias"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const HistoricoCaixa = lazy(() => import("./pages/HistoricoCaixa"));
const ContasReceber = lazy(() => import("./pages/ContasReceber"));
const ContasPagar = lazy(() => import("./pages/ContasPagar"));
const Cadastros = lazy(() => import("./pages/Cadastros"));
const GruposPrecificacao = lazy(() => import("./pages/GruposPrecificacao"));
const Cores = lazy(() => import("./pages/Cores"));
const ConfiguracoesBanco = lazy(() => import("./pages/ConfiguracoesBanco"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DebugAuth = lazy(() => import("./pages/DebugAuth"));
const Diagnostico = lazy(() => import("./pages/Diagnostico"));

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageRouteSkeleton />}>{children}</Suspense>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const adminAccess = useRequireAdmin();
  if (!adminAccess.allowed) return adminAccess.fallback;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ErrorHandler />
      <SessionExpiredBridge />

      <AuthInitializer />

      {import.meta.env.DEV && <ConnectionDebugger />}

      <Switch>
        <Route path="/login">
          <LazyWrapper>
            <Login />
          </LazyWrapper>
        </Route>

        <Route path="/debug-auth">
          {import.meta.env.DEV ? (
            <LazyWrapper>
              <DebugAuth />
            </LazyWrapper>
          ) : (
            <Redirect to="/dashboard" />
          )}
        </Route>

        <Route path="/diagnostico">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <Diagnostico />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>

        <Route path="/vendas">
          <ProtectedRoute>
            <LazyWrapper>
              <Vendas />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/nova-venda">
          <ProtectedRoute>
            <LazyWrapper>
              <NovaVenda />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/clientes">
          <ProtectedRoute>
            <LazyWrapper>
              <Clientes />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/produtos">
          <ProtectedRoute>
            <LazyWrapper>
              <Produtos />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/estoque">
          <ProtectedRoute>
            <LazyWrapper>
              <Estoque />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/entregas">
          <ProtectedRoute>
            <LazyWrapper>
              <Entregas />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/comissao">
          <ProtectedRoute>
            <LazyWrapper>
              <Comissao />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/boletos">
          <ProtectedRoute>
            <LazyWrapper>
              <Boletos />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/relatorios">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <Relatorios />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>

        <Route path="/plano-contas">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <PlanoContas />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>

        <Route path="/contas-fixas">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <ContasFixas />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>

        <Route path="/vendedores">
          <ProtectedRoute>
            <LazyWrapper>
              <Vendedores />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/fornecedores">
          <ProtectedRoute>
            <LazyWrapper>
              <Fornecedores />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/cargas/:id/baixa">
          <ProtectedRoute>
            <LazyWrapper>
              <CargaBaixa />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/cargas/:id">
          <ProtectedRoute>
            <LazyWrapper>
              <CargaDetalhes />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/cargas">
          <ProtectedRoute>
            <LazyWrapper>
              <Cargas />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/meus-pedidos">
          <ProtectedRoute>
            <LazyWrapper>
              <MeusPedidos />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/pendencias">
          <ProtectedRoute>
            <LazyWrapper>
              <Pendencias />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/nota-entrada">
          <ProtectedRoute>
            <LazyWrapper>
              <NotaEntrada />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/promocoes">
          <ProtectedRoute>
            <LazyWrapper>
              <Promocoes />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/financeiro/historico">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <HistoricoCaixa />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>
        <Route path="/financeiro">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <Financeiro />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>
        <Route path="/contas-receber">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <ContasReceber />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>
        <Route path="/contas-pagar">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <ContasPagar />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>

        <Route path="/cadastros">
          <ProtectedRoute>
            <LazyWrapper>
              <Cadastros />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/grupos-precificacao">
          <ProtectedRoute>
            <LazyWrapper>
              <GruposPrecificacao />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/cores">
          <ProtectedRoute>
            <LazyWrapper>
              <Cores />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>
        <Route path="/configuracoes-banco">
          <ProtectedRoute>
            <AdminOnly>
              <LazyWrapper>
                <ConfiguracoesBanco />
              </LazyWrapper>
            </AdminOnly>
          </ProtectedRoute>
        </Route>

        <Route path="/dashboard">
          <ProtectedRoute>
            <LazyWrapper>
              <Dashboard />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>

        <Route path="/">
          <ProtectedRoute>
            <Redirect to="/dashboard" />
          </ProtectedRoute>
        </Route>

        <Route>
          <ProtectedRoute>
            <LazyWrapper>
              <NotFound />
            </LazyWrapper>
          </ProtectedRoute>
        </Route>
      </Switch>
    </>
  );
}
