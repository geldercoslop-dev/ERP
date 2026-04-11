import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { trpc } from '../lib/trpcClient';
import { checkSessionCookies } from '../utils/clearCookies';
import { ShieldCheck, Database, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function DebugAuth() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [dbStatus, setDbStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [dbMessage, setDbMessage] = useState<string>('Verificando conexão...');
  const [cookies, setCookies] = useState<Record<string, string>>({});
  const [hasCookies, setHasCookies] = useState<boolean>(false);
  const sessionInfoQuery = trpc.auth.sessionInfo.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Verificar cookies
  useEffect(() => {
    const { hasCookies: hasSessionCookies, cookies: sessionCookies } = checkSessionCookies();
    setHasCookies(hasSessionCookies);
    setCookies(sessionCookies);
  }, []);

  // Verificar status do banco de dados
  const checkDbMutation = trpc.system.checkDatabase.useMutation({
    onSuccess: (data) => {
      setDbStatus('success');
      setDbMessage(`Conexão bem-sucedida. Tabelas: ${(data as any)?.tables?.length || 0}, Vendedores: ${(data as any)?.vendedores?.length || 0}`);
    },
    onError: (error) => {
      setDbStatus('error');
      setDbMessage(`Erro na conexão: ${error.message}`);
    }
  });

  // Executar verificação do banco de dados ao carregar
  useEffect(() => {
    checkDbMutation.mutate();
  }, []);

  const serverSession = sessionInfoQuery.data?.session ?? null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <ShieldCheck className="h-8 w-8 text-purple-400" />
          <h1 className="text-2xl font-bold">Diagnóstico de Autenticação</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status de Autenticação */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-purple-400" />
              Status de Autenticação
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="text-gray-400 w-32">Estado:</div>
                <div className="flex items-center gap-2">
                  {isAuthenticated ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-green-400 font-medium">Autenticado</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-red-400 font-medium">Não autenticado</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-gray-400 w-32">Carregando:</div>
                <span>{isLoading ? 'Sim' : 'Não'}</span>
              </div>

              <div className="flex items-start gap-2">
                <div className="text-gray-400 w-32">Usuário:</div>
                <div>
                  {user ? (
                    <div className="space-y-1">
                      <div><span className="text-gray-400">ID:</span> {user?.id}</div>
                      <div><span className="text-gray-400">Nome:</span> {user?.name || "Usuário"}</div>
                      <div><span className="text-gray-400">Nível:</span> {user?.role || "desconhecido"}</div>
                      <div><span className="text-gray-400">OpenID:</span> {user?.openId || "-"}</div>
                    </div>
                  ) : (
                    <span className="text-gray-500 italic">Nenhum usuário logado</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status do Banco de Dados */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-400" />
              Status do Banco de Dados
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="text-gray-400 w-32">Estado:</div>
                <div className="flex items-center gap-2">
                  {dbStatus === 'checking' && (
                    <span className="text-yellow-400 font-medium">Verificando...</span>
                  )}
                  {dbStatus === 'success' && (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-green-400 font-medium">Conectado</span>
                    </>
                  )}
                  {dbStatus === 'error' && (
                    <>
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-red-400 font-medium">Erro</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="text-gray-400 w-32">Mensagem:</div>
                <div className="text-sm">{dbMessage}</div>
              </div>

              <div className="mt-4">
                <button 
                  onClick={() => {
                    setDbStatus('checking');
                    setDbMessage('Verificando conexão...');
                    checkDbMutation.mutate();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
                >
                  Verificar Novamente
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Cookies e Token */}
        <div className="mt-6 bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Informações de Sessão
          </h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Origem da sessão (server-side)</h3>
              <div className="bg-gray-900 p-3 rounded-lg overflow-x-auto">
                <pre className="text-xs text-amber-300 whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      origin: serverSession?.origin ?? null,
                      cookieName: serverSession?.cookieName ?? null,
                      tokenPresent: serverSession?.tokenPresent ?? null,
                      tokenKind: serverSession?.tokenKind ?? null,
                      serverUser: sessionInfoQuery.data?.user ?? null,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">Cookies de Sessão</h3>
              {hasCookies ? (
                <div className="bg-gray-900 p-3 rounded-lg overflow-x-auto">
                  <pre className="text-xs text-green-300 whitespace-pre-wrap">
                    {JSON.stringify(cookies, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="text-gray-400 italic">Nenhum cookie de sessão encontrado</div>
              )}
            </div>

            <div>
              <h3 className="text-lg font-medium mb-2">LocalStorage</h3>
              <div className="bg-gray-900 p-3 rounded-lg overflow-x-auto">
                <pre className="text-xs text-blue-300 whitespace-pre-wrap">
                  {JSON.stringify({
                    'manus-auth-store': localStorage.getItem('manus-auth-store'),
                    'manus-runtime-user-info': localStorage.getItem('manus-runtime-user-info')
                  }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          Esta página é apenas para fins de diagnóstico e depuração.
        </div>
      </div>
    </div>
  );
}