# Auditoria de Segurança do Login - GRS ERP

Objetivo: Confirmar que o acesso às rotas protegidas exige sessão válida.

## 1. Fluxo de autenticação

- Login: auth.login (publicProcedure) valida credenciais e define cookie session_token/session.
- Contexto: createContext lê cookie ou X-Session-Token ou Bearer; resolve para ctx.user. Cookie é a credencial.
- auth.me: Retorna ctx.user se existir; sozinho não autentica - apenas reflete o context.
- Rotas protegidas: protectedProcedure exige ctx.user; sem user retorna UNAUTHORIZED.

## 2. Checklist

- Cookie/header são a fonte da sessão no servidor; não há 2FA na sessão atual.
- auth.me não concede acesso; apenas reflete user já resolvido.
- Todas as procedures sensíveis usam protectedProcedure ou adminProcedure.
- REST sensível (/api/backup/download) protegida com requireAdmin.

## 3. Riscos

- Token roubado: usar httpOnly e HTTPS em produção.
- Vendedor inativo: createContext checa vendedor.ativo; se inativo user = null.
- Fallback dev: restringir a NODE_ENV=development.
