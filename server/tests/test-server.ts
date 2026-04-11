/**
 * Test Server Bootstrap
 * 
 * Inicia servidor automaticamente para testes
 * Elimina dependência de localhost:3000 manual
 */

import { createServer } from 'http';
import { app } from '../index.js';

let server: ReturnType<typeof createServer> | null = null;

export interface TestServer {
  port: number;
  close: () => Promise<void>;
  url: string;
}

/**
 * Inicia servidor para testes
 */
export async function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    // Porta aleatória para evitar conflitos
    const port = 0;
    
    server = createServer(app);
    
    server.listen(port, '127.0.0.1', () => {
      if (!server) {
        reject(new Error('Failed to start server'));
        return;
      }
      
      const address = server.address();
      if (address && typeof address === 'object') {
        const actualPort = address.port;
        const url = `http://127.0.0.1:${actualPort}`;
        
        console.log(`🧪 Test server started: ${url}`);
        
        resolve({
          port: actualPort,
          close: async () => {
            if (server) {
              return new Promise<void>((closeResolve) => {
                server.close(() => {
                  server = null;
                  closeResolve();
                });
              });
            }
          },
          url
        });
      } else {
        reject(new Error('Invalid server address'));
      }
    });
    
    server.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Para servidor de testes
 */
export async function stopTestServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        server = null;
        resolve();
      });
    });
  }
}

/**
 * Hook para setup/teardown automático
 */
export function useTestServer() {
  let testServer: TestServer | null = null;
  
  const beforeAll = async () => {
    testServer = await startTestServer();
    return testServer;
  };
  
  const afterAll = async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  };
  
  return {
    beforeAll,
    afterAll,
    getServer: () => testServer
  };
}
