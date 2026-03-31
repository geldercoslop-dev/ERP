import { TRPCError } from "@trpc/server";
import { authLogger } from "./logger.js";

interface LoginAttempt {
  attempts: number;
  lastAttempt: number;
}

// Armazenamento em memória para tentativas de login
// Em produção com múltiplos processos, isso deveria ser um Redis,
// mas seguindo a regra de não alterar o banco de dados/infra, usaremos memória.
const loginAttempts = new Map<string, LoginAttempt>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Obtém a chave única para rastreamento (combinação de usuário e IP)
 */
function getAttemptKey(username: string, ip: string): string {
  return `${username.toLowerCase()}:${ip}`;
}

/**
 * Aplica um delay progressivo baseado no número de tentativas
 */
async function applyProgressiveDelay(attempts: number) {
  if (attempts <= 1) return;
  
  // Delay: 2ª tentativa = 1s, 3ª = 2s, 4ª = 3s, etc.
  const delayMs = Math.min((attempts - 1) * 1000, 10000); // Máximo 10s
  
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Verifica se o usuário está bloqueado por brute force e aplica delay
 */
export async function validateLoginAttempt(username: string, ip: string) {
  const key = getAttemptKey(username, ip);
  const attempt = loginAttempts.get(key);
  const now = Date.now();

  if (attempt) {
    // Verificar se ultrapassou o limite e se ainda está no período de bloqueio
    if (attempt.attempts >= MAX_ATTEMPTS && (now - attempt.lastAttempt) < LOCKOUT_TIME_MS) {
      const remainingMinutes = Math.ceil((LOCKOUT_TIME_MS - (now - attempt.lastAttempt)) / 60000);
      
      authLogger.warn({ username, ip, attempts: attempt.attempts }, "Tentativa de login bloqueada por brute force");
      
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Muitas tentativas de login. Tente novamente em ${remainingMinutes} minuto(s).`,
      });
    }

    // Aplicar delay progressivo
    await applyProgressiveDelay(attempt.attempts);
  }
}

/**
 * Registra uma falha de login
 */
export function recordLoginFailure(username: string, ip: string) {
  const key = getAttemptKey(username, ip);
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { attempts: 0, lastAttempt: 0 };

  // Se a última tentativa foi há mais de 5 minutos, resetar contador parcial? 
  // Não, manteremos o contador até um sucesso ou expiração natural do mapa se implementássemos.
  // Mas para simplificar, se passou muito tempo, podemos resetar.
  if (now - attempt.lastAttempt > LOCKOUT_TIME_MS) {
    attempt.attempts = 1;
  } else {
    attempt.attempts++;
  }
  
  attempt.lastAttempt = now;
  loginAttempts.set(key, attempt);

  authLogger.info({ 
    username, 
    ip, 
    attempts: attempt.attempts,
    timestamp: new Date(now).toISOString()
  }, "Falha na tentativa de login registrada");
}

/**
 * Registra um sucesso de login (limpa tentativas)
 */
export function recordLoginSuccess(username: string, ip: string) {
  const key = getAttemptKey(username, ip);
  loginAttempts.delete(key);
  
  authLogger.info({ username, ip }, "Login bem-sucedido, contador de tentativas resetado");
}

/**
 * Retorna uma mensagem de erro genérica para segurança
 */
export function getGenericAuthError(): TRPCError {
  return new TRPCError({
    code: "UNAUTHORIZED",
    message: "Usuário ou senha inválidos",
  });
}
