import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { trpc } from "@/lib/trpcClient";

interface ServerStatus {
  status: "checking" | "online" | "offline";
  port: string;
  lastChecked: Date;
  error?: string;
}

interface ProblemaConsistencia {
  tipoProblema: string;
  entidade: string;
  id?: string | number;
  detalhe: string;
  sugestao: string;
  mensagem?: string;
  entityId?: string | number;
}

export default function Diagnostico() {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: false });
  const { data: problemas, refetch: rodarVerificacao, isFetching: verificando } = trpc.diagnostico.run.useQuery(
    undefined,
    { enabled: false }
  );
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    status: "checking",
    port: import.meta.env.VITE_PORT || "3003",
    lastChecked: new Date(),
  });
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  useEffect(() => {
    // Coletar variáveis de ambiente
    const env = {
      VITE_PORT: import.meta.env.VITE_PORT || "não definido",
      VITE_TRPC_URL: import.meta.env.VITE_TRPC_URL || "não definido",
      NODE_ENV: import.meta.env.NODE_ENV || "não definido",
      DEV: import.meta.env.DEV ? "true" : "false",
      PROD: import.meta.env.PROD ? "true" : "false",
    };
    setEnvVars(env);

    // Verificar status do servidor
    const checkServer = async () => {
      const port = import.meta.env.VITE_PORT || "3003";
      try {
        const response = await fetch(`http://localhost:${port}/api/trpc/auth.me`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (response.ok) {
          setServerStatus({
            status: "online",
            port,
            lastChecked: new Date(),
          });
        } else {
          setServerStatus({
            status: "offline",
            port,
            lastChecked: new Date(),
            error: `Erro ${response.status}: ${response.statusText}`,
          });
        }
      } catch (error) {
        setServerStatus({
          status: "offline",
          port,
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-amber-400">Diagnóstico do Sistema</h1>
          <Link to="/" className="px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 rounded-md">
            Voltar ao sistema
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status do servidor */}
          <div className="bg-gray-800 rounded-lg p-5 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-300">Status do Servidor</h2>
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  serverStatus.status === "checking"
                    ? "bg-yellow-500"
                    : serverStatus.status === "online"
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              />
              <span className="font-medium">
                {serverStatus.status === "checking"
                  ? "Verificando..."
                  : serverStatus.status === "online"
                  ? "Online"
                  : "Offline"}
              </span>
            </div>
            <div className="text-sm text-gray-300 space-y-1">
              <p>Porta: {serverStatus.port}</p>
              <p>
                Última verificação:{" "}
                {serverStatus.lastChecked.toLocaleTimeString()}
              </p>
              {serverStatus.error && (
                <p className="text-red-400">Erro: {serverStatus.error}</p>
              )}
            </div>
          </div>

          {/* Status da autenticação */}
          <div className="bg-gray-800 rounded-lg p-5 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-300">
              Status da Autenticação
            </h2>
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span>Verificando...</span>
              </div>
            ) : user ? (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="font-medium">Autenticado</span>
                </div>
                <div className="text-sm text-gray-300 space-y-1">
                  <p>Nome: {user?.name ?? "—"}</p>
                  <p>Função: {user?.role === "admin" ? "Administrador" : "Vendedor"}</p>
                  <p>ID: {user?.id ?? "—"}</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="font-medium">Não autenticado</span>
                </div>
                <div className="mt-3">
                  <Link
                    to="/login"
                    className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 rounded text-sm"
                  >
                    Ir para o login
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Variáveis de ambiente */}
          <div className="bg-gray-800 rounded-lg p-5 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-300">
              Variáveis de Ambiente
            </h2>
            <div className="text-sm text-gray-300">
              <table className="w-full">
                <tbody>
                  {Object.entries(envVars).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-700">
                      <td className="py-2 font-medium">{key}</td>
                      <td className="py-2 text-right">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Informações do navegador */}
          <div className="bg-gray-800 rounded-lg p-5 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-amber-300">
              Informações do Navegador
            </h2>
            <div className="text-sm text-gray-300 space-y-1">
              <p>User Agent: {navigator.userAgent}</p>
              <p>Cookies habilitados: {navigator.cookieEnabled ? "Sim" : "Não"}</p>
              <p>Linguagem: {navigator.language}</p>
              <p>URL atual: {window.location.href}</p>
            </div>
          </div>
        </div>

        {/* Verificação de consistência (admin) */}
        <div className="mt-8 bg-gray-800 rounded-lg p-5 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-amber-300">
            Consistência do banco (Financeiro / Estoque / Pedidos)
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            Verifica: pedidos sem itens, itens sem produto, pendências quebradas, totais inconsistentes, estoque negativo, contas a receber órfãs.
          </p>
          <button
            onClick={() => rodarVerificacao()}
            disabled={verificando}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-md font-medium disabled:opacity-50"
          >
            {verificando ? "Verificando..." : "Rodar verificação"}
          </button>
          {problemas !== undefined && (
            <div className="mt-4">
              {problemas.length === 0 ? (
                <p className="text-green-400">Nenhum problema encontrado.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {(problemas as ProblemaConsistencia[]).map((p, i) => (
                    <li key={i} className={`p-3 rounded border ${p.tipoProblema === "erro" ? "border-red-500/50 bg-red-900/20 text-red-200" : "border-amber-500/30 bg-amber-900/10 text-amber-200"}`}>
                      <span className="font-medium">[{p.tipoProblema}] {p.entidade}</span>
                      {p.id != null && <span className="text-gray-400 ml-1"> (id {p.id})</span>}
                      <p className="mt-1 text-gray-300">{p.detalhe ?? p.mensagem}</p>
                      {p.sugestao && <p className="mt-1 text-amber-200/90 text-xs">Sugestão: {p.sugestao}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Ações de diagnóstico */}
        <div className="mt-8 bg-gray-800 rounded-lg p-5 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-amber-300">
            Ações de Diagnóstico
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                localStorage.clear();
                document.cookie.split(";").forEach((cookie) => {
                  document.cookie = cookie
                    .replace(/^ +/, "")
                    .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
                });
                alert("Cookies e localStorage limpos!");
              }}
              className="px-4 py-2 bg-red-600/30 hover:bg-red-600/50 rounded-md"
            >
              Limpar cookies e localStorage
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600/30 hover:bg-blue-600/50 rounded-md"
            >
              Recarregar página
            </button>
            <Link
              to="/login?force=true"
              className="px-4 py-2 bg-amber-600/30 hover:bg-amber-600/50 rounded-md"
            >
              Forçar login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}