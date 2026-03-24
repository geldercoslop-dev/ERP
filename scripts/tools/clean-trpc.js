const fs = require('fs');
const path = require('path');

// Caminho para o arquivo trpcClient.ts
const filePath = path.join(__dirname, 'client', 'src', 'lib', 'trpcClient.ts');

// Conteúdo limpo e simplificado
const cleanContent = `import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { TRPCClientError } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../../server/routers';
import { toast } from 'sonner';

// Cliente tRPC
export const trpc = createTRPCReact<AppRouter>();

// Configuração do cliente tRPC
export const trpcClientConfig = {
  transformer: superjson,
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_TRPC_URL || 'http://localhost:3001/api/trpc',
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
  queryClientConfig: {
    defaultOptions: {
      queries: {
        retry: 3,
        staleTime: 5 * 60 * 1000,
        cacheTime: 10 * 60 * 1000,
      },
      mutations: {},
    },
  },
};`;

// Escrever o conteúdo limpo no arquivo
try {
  fs.writeFileSync(filePath, cleanContent, 'utf8');
  console.log('Arquivo trpcClient.ts limpo e simplificado com sucesso!');
} catch (error) {
  console.error('Erro ao escrever no arquivo:', error);
}