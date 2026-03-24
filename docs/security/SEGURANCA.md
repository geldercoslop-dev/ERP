# Segurança — GRS ERP

Referência de boas práticas e pontos de atenção (sem alterar regras de negócio).

---

## Autenticação e sessão

- Login via `auth.login`; sessão por cookie e/ou header `X-Session-Token`
- Roles: **admin** e **vendedor**; acesso às rotas e menus conforme role
- Em produção: usar `ADMIN_INITIAL_PASSWORD` e trocar após primeiro acesso
- Nunca usar senhas ou tokens literais em código ou em repositório

---

## Ambiente

- `.env` e arquivos com segredos não versionados
- `.env.example` sem valores reais; documentar variáveis obrigatórias
- Em produção: credenciais apenas em variáveis de ambiente ou secrets do servidor

---

## API e rede

- CORS configurado (`ALLOWED_ORIGINS`) em produção
- Rate limit opcional (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`)
- Health em `/health` sem dados sensíveis; detalhes em `/api/health` para operação

---

## Backup e recuperação

- Backup do banco antes de migrações (ver `docs/DEPLOY.md`)
- Script: `npm run backup:db`; arquivos em `backups/` (não versionados)
- Restore apenas com backup validado; após restore, rodar `npm run check:db` e migrações se necessário

---

## O que não alterar

- Regras de pedidos, estoque, financeiro, cargas, pendências
- Contratos de API e arquitetura backend
- Transações, idempotência e fluxo de autenticação

Detalhes de deploy e rollback: `docs/DEPLOY.md`.
