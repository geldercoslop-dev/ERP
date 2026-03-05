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
  const allCookies = document.cookie || "";
  
  // Verificar se existe algum cookie relacionado à sessão
  const hasCookies = /session|auth|token|connect\.sid/i.test(allCookies);
  
  const cookies: Record<string, string> = {};
  try {
    allCookies
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const idx = pair.indexOf("=");
        if (idx <= 0) return;
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (!k) return;
        cookies[k] = decodeURIComponent(v);
      });
  } catch {
    // se falhar, apenas retorna objeto vazio
  }

  return {
    hasCookies,
    cookies,
    raw: allCookies,
  };
}