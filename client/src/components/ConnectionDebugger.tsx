import { useEffect, useState } from 'react';
import { sameOriginFetch } from '@/lib/security/apiClient';

export function ConnectionDebugger() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  useEffect(() => {
    const input = encodeURIComponent(JSON.stringify({}));
    const apiUrl = `/api/trpc/auth.me?input=${input}`;

    const checkConnection = async () => {
      try {
        const response = await sameOriginFetch(apiUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        });

        if (response.ok) {
          setStatus('connected');
        } else {
          setStatus('error');
          setErrorDetails(`Erro ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        setStatus('error');
        setErrorDetails(error instanceof Error ? error.message : 'Erro de rede');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 8000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'connected' || import.meta.env.PROD) return null;

  if (status === 'checking') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black/90 text-white p-2 z-[100] border-t border-red-500/50">
      <div className="max-w-screen-lg mx-auto flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Sem conexão com o servidor. {errorDetails}
        </span>
        <span className="text-white/70">
          Inicie o servidor: <kbd className="px-1 bg-white/10 rounded">.\start-system.ps1</kbd> ou <kbd className="px-1 bg-white/10 rounded">pnpm run dev:windows</kbd>
        </span>
      </div>
    </div>
  );
}