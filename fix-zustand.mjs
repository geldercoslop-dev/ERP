/**
 * Script para verificar e corrigir o problema do zustand
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho para o arquivo authStore.ts
const authStorePath = path.join(__dirname, 'client', 'src', 'store', 'authStore.ts');

// Verificar se o diretório zustand existe
const zustandPath = path.join(__dirname, 'node_modules', 'zustand');
const zustandExists = fs.existsSync(zustandPath);

console.log(`Verificando zustand: ${zustandExists ? 'Existe' : 'Não existe'}`);

// Verificar se o middleware existe
const middlewarePath = path.join(zustandPath, 'middleware');
const middlewareExists = fs.existsSync(middlewarePath);

console.log(`Verificando zustand/middleware: ${middlewareExists ? 'Existe' : 'Não existe'}`);

// Tentar reinstalar o zustand
if (!zustandExists || !middlewareExists) {
  console.log('Reinstalando zustand...');
  try {
    execSync('npm install zustand@latest --force', { stdio: 'inherit' });
    console.log('Zustand reinstalado com sucesso!');
  } catch (error) {
    console.error('Erro ao reinstalar zustand:', error);
  }
}

// Criar uma versão simplificada do authStore.ts sem zustand
const simplifiedAuthStore = `// Versão simplificada do authStore.ts sem zustand
// Para uso temporário até que o zustand seja instalado corretamente

import { trpc } from '@/lib/trpcClient';
import { toast } from 'sonner';

// Tipos
export type UserRole = 'admin' | 'vendedor';

export interface User {
  id: number;
  openId: string;
  name: string;
  email?: string | null;
  role: UserRole;
}

// Estado global simplificado
let globalUser = null;
let globalIsLoading = false;
let globalIsAuthenticated = false;

// Carregar do localStorage
try {
  const stored = localStorage.getItem('manus-auth-store');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.state && parsed.state.user) {
      globalUser = parsed.state.user;
      globalIsAuthenticated = parsed.state.isAuthenticated || false;
    }
  }
} catch (e) {
  console.error('Erro ao carregar estado do localStorage:', e);
}

// Store de autenticação simplificada
export const useAuthStore = () => ({
  // Estado
  user: globalUser,
  isLoading: globalIsLoading,
  isAuthenticated: globalIsAuthenticated,
  
  // Ações
  setUser: (user) => {
    globalUser = user;
    globalIsAuthenticated = !!user;
    
    // Também manter o localStorage legado para compatibilidade
    if (user) {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify({
          openId: user.openId,
          name: user.name,
          role: user.role,
        })
      );
      
      // Salvar no localStorage
      localStorage.setItem('manus-auth-store', JSON.stringify({
        state: {
          user,
          isAuthenticated: true
        }
      }));
    } else {
      localStorage.removeItem("manus-runtime-user-info");
      localStorage.removeItem('manus-auth-store');
    }
  },
  
  login: async (username, password) => {
    globalIsLoading = true;
    
    try {
      // Usar fetch diretamente
      const response = await fetch('http://localhost:3001/api/trpc/auth.login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          json: {
            username: username.trim(),
            password: password.trim(),
          }
        }),
        credentials: 'include',
      });
      
      const result = await response.json();
      const data = result.result.data;
      
      if (data?.ok) {
        // Criar objeto de usuário
        const user = {
          id: -1, // ID real será obtido em checkAuth
          openId: data.openId,
          name: data.name,
          role: data.role,
        };
        
        globalUser = user;
        globalIsAuthenticated = true;
        globalIsLoading = false;
        
        // Salvar no localStorage
        localStorage.setItem('manus-auth-store', JSON.stringify({
          state: {
            user,
            isAuthenticated: true
          }
        }));
        
        return true;
      } else {
        globalIsLoading = false;
        return false;
      }
    } catch (error) {
      globalIsLoading = false;
      
      // Mostrar mensagem de erro
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Erro ao fazer login. Tente novamente.";
      
      toast.error(errorMessage);
      return false;
    }
  },
  
  logout: async () => {
    globalIsLoading = true;
    
    try {
      // Usar fetch diretamente
      await fetch('http://localhost:3001/api/trpc/auth.logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      
      // Limpar dados do usuário
      globalUser = null;
      globalIsAuthenticated = false;
      globalIsLoading = false;
      
      // Limpar localStorage
      localStorage.removeItem("manus-runtime-user-info");
      localStorage.removeItem('manus-auth-store');
      
      // Limpar cookies manualmente
      document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost";
      document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      
      // Mostrar mensagem de sucesso
      toast.info("Sessão encerrada com sucesso");
      
      // Redirecionar para login
      window.location.href = \`/login?t=\${Date.now()}\`;
    } catch (error) {
      globalIsLoading = false;
      
      // Forçar logout mesmo com erro
      globalUser = null;
      globalIsAuthenticated = false;
      localStorage.removeItem("manus-runtime-user-info");
      localStorage.removeItem('manus-auth-store');
      
      // Redirecionar para login
      window.location.href = \`/login?t=\${Date.now()}\`;
    }
  },
  
  checkAuth: async () => {
    // Se já temos um usuário e não estamos carregando, não precisamos verificar
    if (globalUser && !globalIsLoading) {
      return true;
    }
    
    globalIsLoading = true;
    
    try {
      // Verificar autenticação com o servidor
      const response = await fetch('http://localhost:3001/api/trpc/auth.me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      const result = await response.json();
      const userData = result.result.data;
      
      if (userData) {
        // Atualizar dados do usuário
        const user = {
          id: userData.id,
          openId: userData.openId,
          name: userData.name,
          email: userData.email,
          role: userData.role,
        };
        
        globalUser = user;
        globalIsAuthenticated = true;
        globalIsLoading = false;
        
        // Salvar no localStorage
        localStorage.setItem('manus-auth-store', JSON.stringify({
          state: {
            user,
            isAuthenticated: true
          }
        }));
        
        return true;
      } else {
        // Usuário não autenticado
        globalUser = null;
        globalIsAuthenticated = false;
        globalIsLoading = false;
        
        localStorage.removeItem('manus-auth-store');
        
        return false;
      }
    } catch (error) {
      // Em caso de erro, considerar não autenticado
      globalUser = null;
      globalIsAuthenticated = false;
      globalIsLoading = false;
      
      localStorage.removeItem('manus-auth-store');
      
      return false;
    }
  }
});

import { useEffect } from 'react';

// Hook para verificar autenticação no carregamento da aplicação
export function useAuthInitializer() {
  // Verificar autenticação ao montar o componente
  useEffect(() => {
    const { checkAuth } = useAuthStore();
    checkAuth();
  }, []);
}`;

// Criar uma versão de backup do authStore.ts
const backupPath = path.join(__dirname, 'client', 'src', 'store', 'authStore.ts.bak');
if (fs.existsSync(authStorePath)) {
  console.log('Criando backup do authStore.ts...');
  fs.copyFileSync(authStorePath, backupPath);
  console.log('Backup criado com sucesso!');
}

// Escrever a versão simplificada do authStore.ts
console.log('Escrevendo versão simplificada do authStore.ts...');
fs.writeFileSync(authStorePath, simplifiedAuthStore, 'utf8');
console.log('Versão simplificada do authStore.ts escrita com sucesso!');

console.log('\nAgora tente iniciar o sistema novamente com "npm run dev:windows"');
console.log('Se o sistema iniciar com sucesso, você pode restaurar o arquivo original executando:');
console.log('  copy client\\src\\store\\authStore.ts.bak client\\src\\store\\authStore.ts');