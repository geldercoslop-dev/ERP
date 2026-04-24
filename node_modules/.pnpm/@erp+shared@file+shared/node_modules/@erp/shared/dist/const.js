export const COOKIE_NAME = "session_token"; // Nome do cookie de sessão
export const ADMIN_SESSION_COOKIE = "admin_session"; // Token admin guardado durante impersonation (10 min)
export const ADMIN_SESSION_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutos
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const AXIOS_TIMEOUT_MS = 30000;
export const UNAUTHED_ERR_MSG = "Você precisa estar logado para realizar esta ação";
export const NOT_ADMIN_ERR_MSG = "Apenas administradores podem realizar esta ação";
