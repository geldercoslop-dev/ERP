# Build do backend para produÃ§Ã£o

## Resumo

- **Build gerada:** sim â€” JavaScript compilado do backend estÃ¡ em `dist/server/_core/index.js`.
- **MÃ©todo:** esbuild (transpila sem type-check; o `tsc` com `tsconfig.server.json` continua com muitos erros de tipo no projeto).
- **Arquivos criados:** um Ãºnico bundle em `dist/server/_core/index.js` (~514 KB) + `dist/server/_core/index.js.map` (source map).
- **Servidor:** inicia com `node dist/server/_core/index.js` (requer `NODE_ENV=production` e, em produÃ§Ã£o real, `DATABASE_URL` ou variÃ¡veis de banco).

---

## 1. tsconfig.server.json

Ajustado com:

- **rootDir:** `"."` (nÃ£o `"server"` porque o servidor importa de `shared/`, `drizzle/` e `instrument.ts`; com `rootDir: "server"` o tsc falharia).
- **outDir:** `"dist"` (a saÃ­da do servidor fica em `dist/server/`; o entry Ã© `dist/server/_core/index.js`).
- **noEmit:** `false`, **allowImportingTsExtensions:** `false`, **moduleResolution:** `"node"` para emissÃ£o de JS.
- **strict / noImplicitAny / strictNullChecks:** relaxados no tsconfig do servidor para futura compilaÃ§Ã£o com `tsc` (hoje o build real Ã© feito pelo esbuild).

---

## 2. CompilaÃ§Ã£o real (produÃ§Ã£o)

O build de produÃ§Ã£o do servidor Ã© feito pelo esbuild, nÃ£o pelo `tsc`:

```bash
pnpm run build:server
# ou
node scripts/build-server.mjs
```

Isso gera:

- `dist/server/_core/index.js` â€” bundle ESM do backend.
- `dist/server/_core/index.js.map` â€” source map.

O comando equivalente a â€œexecutar tscâ€ para o servidor (apenas type-check, sem gerar esse bundle) Ã©:

```bash
pnpm exec tsc -p tsconfig.server.json
```

(Atualmente esse comando ainda pode falhar por erros de tipo no projeto.)

---

## 3. Arquivos gerados

| Arquivo | DescriÃ§Ã£o |
|--------|-----------|
| `dist/server/_core/index.js` | Bundle do servidor (~514 KB), pronto para Node ESM. |
| `dist/server/_core/index.js.map` | Source map para depuraÃ§Ã£o. |

---

## 4. ExecuÃ§Ã£o

```bash
# Na raiz do projeto
export NODE_ENV=production
export PORT=3000
# Opcional: DATABASE_URL ou DB_* para o banco
node dist/server/_core/index.js
```

No Windows (PowerShell):

```powershell
$env:NODE_ENV="production"; $env:PORT="3000"; node dist/server/_core/index.js
```

O servidor sobe na porta definida em `PORT` (padrÃ£o 3000). Se o banco nÃ£o estiver configurado, o app ainda sobe e `/api/health` pode retornar status `degraded` (banco nÃ£o disponÃ­vel).

---

## 5. Health check

A rota **GET /api/health** estÃ¡ disponÃ­vel e responde com JSON, por exemplo:

- `status`: `"ok"` ou `"degraded"`
- `timestamp`, `uptimeSeconds`, `nodeEnv`, `port`
- `database`: `status`, `timeMs`, `database`, `error`, etc.

Exemplo de teste:

```bash
curl http://localhost:3000/api/health
```

---

## 6. PM2

Uso com o `ecosystem.config.js` jÃ¡ configurado em `deployment/`:

```bash
NODE_ENV=production pm2 start deployment/ecosystem.config.js
```

O PM2 usa o script `dist/server/_core/index.js` (definido em `deployment/ecosystem.config.js`).

---

## AlteraÃ§Ãµes feitas no cÃ³digo (mÃ­nimas)

- **server/_core/index.ts:** definiÃ§Ã£o de `__filename` e `__dirname` via `import.meta.url` para ESM no bundle.
- **server/_core/vite.ts:** import dinÃ¢mico de `vite.config` (sÃ³ em dev) para nÃ£o quebrar o build de produÃ§Ã£o.
- **server/infra/pdf/pdf.ts:** novo mÃ³dulo com `gerarPedidoCompraPDF` e `gerarRoteiroEntregaPDF` (imports que faltavam para o esbuild).
- **server/services/orders.service.ts:** export de `listPedidos` (alias de `listPedidosExtended`) para o tool-registry.
- **scripts/build-server.mjs:** script de build do servidor com esbuild (bundle + source map).
- **package.json:** `build:server` passou a rodar `node scripts/build-server.mjs`.

Nenhuma alteraÃ§Ã£o em serviÃ§os de negÃ³cio, banco, autenticaÃ§Ã£o ou rotas alÃ©m do estritamente necessÃ¡rio para o build e execuÃ§Ã£o em produÃ§Ã£o.
