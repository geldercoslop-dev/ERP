/**
 * Utilitário para depuração de problemas de sessão
 */

import { trpc } from "@/lib/trpcClient";
import { checkSessionCookies } from "./clearCookies";

/**
 * Função para verificar o estado da sessão e exibir informações de depuração
 */
export async function debugSession() {
  console.group("🔍 Depuração de Sessão");
  
  // Verificar cookies
  const { hasCookies, cookies } = checkSessionCookies();
  console.log("Cookies de sessão:", { hasCookies, cookies });
  
  // Verificar localStorage
  try {
    const userInfo = localStorage.getItem("manus-runtime-user-info");
    console.log("localStorage user info:", userInfo ? JSON.parse(userInfo) : null);
  } catch (error) {
    console.error("Erro ao ler localStorage:", error);
  }
  
  // Tentar fazer uma requisição para verificar a sessão
  try {
    const utils = trpc.useUtils();
    const meData = utils.auth.me.getData();
    console.log("Dados de me em cache:", meData);
    
    // Tentar refetch
    console.log("Tentando refetch de me...");
    const response = await utils.auth.me.fetch();
    console.log("Resposta de me após refetch:", response);
  } catch (error) {
    console.error("Erro ao verificar sessão:", error);
  }
  
  console.groupEnd();
}

/**
 * Função para verificar o estado da sessão periodicamente
 */
export function startSessionMonitoring(intervalMs = 10000) {
  console.log("Iniciando monitoramento de sessão a cada", intervalMs, "ms");
  
  // Verificar imediatamente
  debugSession();
  
  // Configurar verificação periódica
  const intervalId = setInterval(debugSession, intervalMs);
  
  // Retornar função para parar o monitoramento
  return () => {
    console.log("Parando monitoramento de sessão");
    clearInterval(intervalId);
  };
}