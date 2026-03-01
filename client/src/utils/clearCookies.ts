/**
 * Limpa todos os cookies relacionados à sessão
 */
export function clearAllSessionCookies() {
  // Lista de possíveis cookies relacionados à sessão
  const cookiesToClear = [
    'session_token',
    'session',
    'auth_token',
    'auth',
    'token',
    'user_session',
    'connect.sid'
  ];
  
  // Limpar cada cookie
  cookiesToClear.forEach(name => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost;`;
  });
}

/**
 * Verifica se existem cookies de sessão
 */
export function checkSessionCookies() {
  const allCookies = document.cookie;
  
  // Verificar se existe algum cookie relacionado à sessão
  const hasCookies = /session|auth|token|connect\.sid/i.test(allCookies);
  
  return {
    hasCookies,
    cookies: allCookies
  };
}