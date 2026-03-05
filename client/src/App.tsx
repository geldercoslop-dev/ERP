import React from "react";
import { Route, Switch, Redirect } from "wouter";
import AppShell from "@/components/layout/AppShell";
import { AuthInitializer } from "@/components/AuthInitializer";
import { ErrorHandler } from "@/components/ErrorHandler";
import { ConnectionDebugger } from "@/components/ConnectionDebugger";
import { useAuthStore } from "@/store/authStore";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Estoque from "./pages/Estoque";
import NovaVenda from "./pages/NovaVenda";
import Clientes from "./pages/Clientes";
import Entregas from "./pages/Entregas";
import Comissao from "./pages/MinhasComissoes";
import Boletos from "./pages/FinanceiroBoletos";
import Relatorios from "./pages/Relatorios";
import PlanoContas from "./pages/PlanoContas";
import ContasFixas from "./pages/ContasFixas";
import Produtos from "./pages/Produtos";
import Vendedores from "./pages/Vendedores";
import Fornecedores from "./pages/Fornecedores";
import Cargas from "./pages/Cargas";
import NotaEntrada from "./pages/NotaEntrada";
import Promocoes from "./pages/Promocoes";
import Vendas from "./pages/Vendas";
import MeusPedidos from "./pages/MeusPedidos";
import CargaDetalhes from "./pages/CargaDetalhes";
import CargaBaixa from "./pages/CargaBaixa";
import Pendencias from "./pages/Pendencias";
import Financeiro from "./pages/Financeiro";
import HistoricoCaixa from "./pages/HistoricoCaixa";
import ContasReceber from "./pages/ContasReceber";
import ContasPagar from "./pages/ContasPagar";
import Cadastros from "./pages/Cadastros";
import GruposPrecificacao from "./pages/GruposPrecificacao";
import Cores from "./pages/Cores";
import ConfiguracoesBanco from "./pages/ConfiguracoesBanco";
import NotFound from "./pages/NotFound";
import DebugAuth from "./pages/DebugAuth";
import Diagnostico from "./pages/Diagnostico";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (!isAuthenticated && !isLoading) {
    return <Redirect to={`/login?force=true&t=${Date.now()}`} />;
  }

  return <AppShell>{children}</AppShell>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "admin") return <Redirect to="/" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <ErrorHandler />

      {/* Inicializador de autenticação (NÃO roda no /login) */}
      <AuthInitializer />

      {import.meta.env.DEV && <ConnectionDebugger />}

      <Switch>
        {/* ✅ ROTA PÚBLICA */}
        <Route path="/login" component={Login} />

        <Route path="/debug-auth" component={DebugAuth} />
        {/* Diagnóstico: apenas admin (protegido) */}
        <Route path="/diagnostico">
          <ProtectedShell>
            <AdminOnly><Diagnostico /></AdminOnly>
          </ProtectedShell>
        </Route>

        {/* ✅ Rotas protegidas */}
        <Route path="/vendas">
          <ProtectedShell><Vendas /></ProtectedShell>
        </Route>

        <Route path="/nova-venda">
          <ProtectedShell><NovaVenda /></ProtectedShell>
        </Route>

        <Route path="/clientes">
          <ProtectedShell><Clientes /></ProtectedShell>
        </Route>

        <Route path="/produtos">
          <ProtectedShell><Produtos /></ProtectedShell>
        </Route>

        <Route path="/estoque">
          <ProtectedShell><Estoque /></ProtectedShell>
        </Route>

        <Route path="/entregas">
          <ProtectedShell><Entregas /></ProtectedShell>
        </Route>

        <Route path="/comissao">
          <ProtectedShell><Comissao /></ProtectedShell>
        </Route>

        <Route path="/boletos">
          <ProtectedShell><Boletos /></ProtectedShell>
        </Route>

        <Route path="/relatorios">
          <ProtectedShell><AdminOnly><Relatorios /></AdminOnly></ProtectedShell>
        </Route>

        <Route path="/plano-contas">
          <ProtectedShell><AdminOnly><PlanoContas /></AdminOnly></ProtectedShell>
        </Route>

        <Route path="/contas-fixas">
          <ProtectedShell><AdminOnly><ContasFixas /></AdminOnly></ProtectedShell>
        </Route>

        <Route path="/vendedores">
          <ProtectedShell><Vendedores /></ProtectedShell>
        </Route>

        <Route path="/fornecedores">
          <ProtectedShell><Fornecedores /></ProtectedShell>
        </Route>

        <Route path="/cargas/:id/baixa">
          <ProtectedShell><CargaBaixa /></ProtectedShell>
        </Route>
        <Route path="/cargas/:id">
          <ProtectedShell><CargaDetalhes /></ProtectedShell>
        </Route>
        <Route path="/cargas">
          <ProtectedShell><Cargas /></ProtectedShell>
        </Route>

        <Route path="/meus-pedidos">
          <ProtectedShell><MeusPedidos /></ProtectedShell>
        </Route>

        <Route path="/pendencias">
          <ProtectedShell><Pendencias /></ProtectedShell>
        </Route>

        <Route path="/nota-entrada">
          <ProtectedShell><NotaEntrada /></ProtectedShell>
        </Route>

        <Route path="/promocoes">
          <ProtectedShell><Promocoes /></ProtectedShell>
        </Route>

        {/* Financeiro (hub e subtelas) — admin */}
        <Route path="/financeiro/historico">
          <ProtectedShell><AdminOnly><HistoricoCaixa /></AdminOnly></ProtectedShell>
        </Route>
        <Route path="/financeiro">
          <ProtectedShell><AdminOnly><Financeiro /></AdminOnly></ProtectedShell>
        </Route>
        <Route path="/contas-receber">
          <ProtectedShell><AdminOnly><ContasReceber /></AdminOnly></ProtectedShell>
        </Route>
        <Route path="/contas-pagar">
          <ProtectedShell><AdminOnly><ContasPagar /></AdminOnly></ProtectedShell>
        </Route>

        {/* Cadastros — admin e vendedor (menu já mostra para ambos; página pode restringir ações) */}
        <Route path="/cadastros">
          <ProtectedShell><Cadastros /></ProtectedShell>
        </Route>
        <Route path="/grupos-precificacao">
          <ProtectedShell><GruposPrecificacao /></ProtectedShell>
        </Route>
        <Route path="/cores">
          <ProtectedShell><Cores /></ProtectedShell>
        </Route>
        <Route path="/configuracoes-banco">
          <ProtectedShell><ConfiguracoesBanco /></ProtectedShell>
        </Route>

        {/* Home no final (senão captura tudo) */}
        <Route path="/">
          <ProtectedShell><Home /></ProtectedShell>
        </Route>

        <Route>
          <ProtectedShell><NotFound /></ProtectedShell>
        </Route>
      </Switch>
    </>
  );
}
