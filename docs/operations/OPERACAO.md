# Operação — GRS ERP

Como subir, reiniciar e monitorar o servidor em produção.

---

## Pré-requisitos

- Node.js (versão compatível com o projeto)
- MySQL configurado (variáveis `DATABASE_URL` ou `DB_*`)
- `.env` ou `.env.production` com `NODE_ENV=production`, `PORT` e credenciais

---

## Subir o servidor

### Build + start

```bash
npm run start:prod
```

### Build e start separados (ex.: CI)

```bash
npm run build
npm run start
```

### Com PM2 (recomendado)

```bash
npm run build
pm2 start ecosystem.config.cjs
```

Reinício: `pm2 restart grs`. Logs: `pm2 logs grs`.

---

## Health-check

- **GET /health** — mínimo para load balancer: `200` = ok, `503` = degradado
- **GET /api/health** — detalhes (db, schemaVersion, uptime)
- **Script:** `npm run health-check` (exit 0 = ok, 1 = falha; útil para cron/deploy)

---

## Logs

- **PM2:** `logs/out.log`, `logs/err.log`; rotação: `pm2 install pm2-logrotate`
- **Aplicação:** se `LOG_DIR` estiver definido, logs com rotação em `LOG_DIR/app.log`

---

## Variáveis em produção

- `NODE_ENV=production`, `PORT`, `DATABASE_URL` ou `DB_*`
- `ADMIN_INITIAL_PASSWORD` — alterar após primeiro login
- `LOG_DIR`, `LOG_MAX_BYTES` (opcional)
- `ALLOWED_ORIGINS`, `RATE_LIMIT_*` (opcional)

Backup/restore: ver `docs/DEPLOY.md`. Segurança: `docs/SEGURANCA.md`.
