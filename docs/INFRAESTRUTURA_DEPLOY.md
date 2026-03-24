# Infraestrutura de deploy do ERP

Objetivo: execuÃ§Ã£o estÃ¡vel do backend em produÃ§Ã£o com PM2, logs persistentes e variÃ¡veis de ambiente.

---

## 1. ConfiguraÃ§Ã£o PM2

**Arquivo:** `ecosystem.config.js` (raiz do projeto)

| OpÃ§Ã£o | Valor |
|-------|--------|
| **name** | erp-server |
| **script** | dist/server/_core/index.js |
| **node_env** | production |
| **instances** | 1 |
| **autorestart** | true |
| **error_file** | ./logs/erp-error.log |
| **out_file** | ./logs/erp-out.log |
| **log_date_format** | YYYY-MM-DD HH:mm:ss Z |
| **merge_logs** | true |

---

## 2. Validar execuÃ§Ã£o PM2

Na raiz do projeto (com PM2 instalado: `npm i -g pm2` ou `pnpm add -D pm2`):

```bash
pm2 start ecosystem.config.js
pm2 status
```

Ou com env de produÃ§Ã£o:

```bash
NODE_ENV=production pm2 start ecosystem.config.js
pm2 status
```

No Windows (PowerShell):

```powershell
$env:NODE_ENV="production"; pm2 start ecosystem.config.js
pm2 status
```

Scripts npm disponÃ­veis:

- `pnpm run pm2:start` â€” inicia com env production
- `pnpm run pm2:status` â€” status dos processos
- `pnpm run pm2:logs` â€” tail dos logs do erp-server

---

## 3. Logs persistentes

| Arquivo | ConteÃºdo |
|---------|----------|
| **logs/erp-error.log** | stderr do processo |
| **logs/erp-out.log** | stdout do processo |

A pasta `logs/` Ã© criada automaticamente pelo PM2 ao iniciar. Para nÃ£o versionar conteÃºdo de log, `logs/` estÃ¡ no `.gitignore`. Em produÃ§Ã£o, garanta permissÃµes de escrita no diretÃ³rio.

---

## 4. VariÃ¡veis de ambiente

**Modelo:** `.env.production.example`

Copie e preencha na raiz:

```bash
cp .env.production.example .env.production
```

VariÃ¡veis incluÃ­das no modelo:

| VariÃ¡vel | DescriÃ§Ã£o |
|----------|-----------|
| **PORT** | Porta do servidor (ex.: 3000) |
| **DATABASE_URL** | URL MySQL (mysql://user:pass@host:3306/db) |
| **JWT_SECRET** | Secret para sessÃ£o/tokens (obrigatÃ³rio em produÃ§Ã£o) |
| **OPENAI_API_KEY** | Chave OpenAI (opcional, IA/LEO) |
| **GROQ_API_KEY** | Chave GROQ (opcional, IA/LEO) |
| **GEMINI_API_KEY** | Chave Gemini (opcional, IA/LEO) |

O app carrega `.env.production` quando `NODE_ENV=production`. No servidor vocÃª pode usar apenas variÃ¡veis de ambiente do sistema (sem arquivo).

---

## 5. Validar execuÃ§Ã£o em produÃ§Ã£o

1. Build (se ainda nÃ£o fez):  
   `pnpm run build:prod`

2. Iniciar com PM2 em produÃ§Ã£o:  
   `NODE_ENV=production pm2 start ecosystem.config.js`

3. Conferir status:  
   `pm2 status` â€” erp-server deve aparecer **online**.

4. Testar API:  
   `curl http://localhost:3000/api/health`  
   (ajuste a porta se usar outra em `PORT`.)

5. Ver logs:  
   `pm2 logs erp-server` ou leia `logs/erp-out.log` e `logs/erp-error.log`.

---

## 6. RelatÃ³rio de confirmaÃ§Ã£o

| Item | Como confirmar |
|------|----------------|
| **PM2 executando servidor** | `pm2 status` â†’ erp-server **online** |
| **Logs funcionando** | Arquivos `logs/erp-out.log` e `logs/erp-error.log` existem e sÃ£o atualizados |
| **API respondendo** | `GET /api/health` retorna 200 e JSON com `status`, `database`, etc. |
| **Pronto para deploy Nginx** | Backend estÃ¡vel na porta configurada (ex.: 3000); configurar Nginx como proxy para essa porta (ver `deployment/nginx.conf` e `deployment/DEPLOY.md`) |

---

## Resumo

- **ecosystem.config.js** â€” configurado (erp-server, script, NODE_ENV, logs em `logs/`).
- **Logs** â€” `logs/erp-error.log` e `logs/erp-out.log` persistentes.
- **.env.production.example** â€” modelo com PORT, DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY.
- **ValidaÃ§Ã£o** â€” `pm2 start ecosystem.config.js`, `pm2 status`, `GET /api/health`.
- **Nginx** â€” usar `deployment/nginx.conf` e guia em `deployment/DEPLOY.md` para expor o ERP na porta 80/443.

---

## RelatÃ³rio de conclusÃ£o

| ConfirmaÃ§Ã£o | Status |
|-------------|--------|
| **PM2 executando servidor** | ConfiguraÃ§Ã£o em `ecosystem.config.js` (name: erp-server, script: dist/server/_core/index.js). Validar com `pm2 start ecosystem.config.js` e `pm2 status`. |
| **Logs funcionando** | Logs persistentes em `logs/erp-error.log` e `logs/erp-out.log` configurados no ecosystem. |
| **API respondendo** | ApÃ³s `pm2 start`, testar `GET /api/health` na porta definida em PORT (ex.: 3000). |
| **Pronto para deploy Nginx** | Sim. Backend estÃ¡vel via PM2; usar `deployment/nginx.conf` e `deployment/DEPLOY.md` para configurar o proxy reverso. |
