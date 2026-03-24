# DiagnÃ³stico: dev â€œtravadoâ€ / `/api/health` nÃ£o responde

## O que foi verificado (infra)

1. **A porta 3000** (padrão) pode estar **ocupada por processos antigos** (`node` / `tsx`). O servidor usa `PORT` do `.env.development`; se a porta pedida estiver em uso, o código **busca porta alternativa** — o browser pode estar na URL errada.
2. **MySQL** e **Redis** devem responder na `DATABASE_URL` e em `REDIS_HOST`/`REDIS_PORT`.
3. **`instrument.ts`** agora carrega `.env.development` em `NODE_ENV=development` (alinhado ao `loadEnv`).
4. **`loadEnv.ts`** imprime linhas `[BOOT infra] ...` para ver onde o boot parou.

## Comandos

```bash
pnpm run diag:infra      # portas + ping MySQL + ping Redis
pnpm run check:infra     # validaÃ§Ã£o mais completa (script do servidor)
```

### Docker (MySQL + Redis locais)

```bash
pnpm run infra:up        # docker compose -f docker-compose.infra.yml up -d
pnpm run infra:down
```

Credenciais do compose estÃ£o alinhadas com `DATABASE_URL` tÃ­pica: `vendas` / `vendas123` / `vendas_app`.

### Porta em uso (Windows)

1. `netstat -ano | findstr ":3000"`
2. Anotar o **PID** em `LISTENING`.
3. Encerrar sÃ³ o processo do **seu** dev server: `taskkill /PID <pid> /F`
4. Subir de novo: `pnpm run dev`

**NÃ£o** mate todos os `node.exe` â€” IDEs (Cursor) usam vÃ¡rios processos Node.

## Health

- URL: `http://localhost:<PORT>/api/health` onde `<PORT>` Ã© o valor de `PORT` no `.env.development` (ex.: 3000).
- Se a porta estiver ocupada, confira o log **`PORTA FINAL USADA`** no boot.
