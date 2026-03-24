# Verificação de dependências e TypeScript – Backend

## 1. Libs solicitadas

| Lib        | No package.json | Observação |
|-----------|------------------|------------|
| **pino**  | ✅ `"pino": "^10.3.1"` | Presente |
| **drizzle-orm** | ✅ `"drizzle-orm": "^0.44.5"` | Presente |
| **zod**   | ✅ `"zod": "^4.1.12"` | Presente |
| **nanoid** | ✅ `"nanoid": "^5.1.5"` | Presente |
| **trpc**  | ✅ `@trpc/client`, `@trpc/react-query`, `@trpc/server` (^11.6.0) | Presente |
| **redis** | ⚠️ Não existe como `redis` | Projeto usa **ioredis** (`"ioredis": "^5.10.0"`) |
| **bullmq** | ✅ `"bullmq": "^5.70.4"` | Presente |

---

## 2. Tsconfig paths (raiz)

Em `tsconfig.json`:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./client/src/*"],
  "@shared/*": ["./shared/*"],
  "@server/*": ["./server/*"],
  "@types/*": ["./types/*"],
  "@leo/*": ["./server/leo/*"]
}
```

Não há path para `server/core`; o backend usa a pasta **`server/_core`**. Vários arquivos importam `../../core/logger` ou `../core/...`, o que gera **módulo não encontrado** porque o diretório correto é `_core`.

---

## 3. Imports quebrados (padrões)

- **`../core/logger`** ou **`../../core/logger`** → deveria ser **`../_core/logger`** ou **`../../_core/logger`** (ou `logger-rotation` onde for o caso).
- **`../core/logger-rotation`** → **`../_core/logger-rotation`** (quando o arquivo está em `server/leo/...`).
- **`../core/env`**, **`../core/errors`**, **`../core/types`**, **`../core/event-bus`** → não existem em `server/`; existem em `server/_core` ou em outros módulos (ex.: `shared`, `server/utils`).
- **`server/db`**: vários arquivos usam `insertLeoActionLog`, `getUserByOpenId`, `upsertUser`, `getVendedorById`, `gerarBackupCompleto`, etc. Esses nomes **não estão exportados** em `server/db` (ou estão em `server/db.ts` legado); o ponto único de DB é `server/db/index.ts`, que exporta tipos e `getDb`, schema, etc.
- **`Module '"./leo-events"' has no exported member 'EventType'`** (e similares): imports nomeados onde o módulo exporta default.
- **shared/types**: `Module "./entities" has already exported a member named 'LeoEvent'` (e `LeoTask`) — re-export duplicado em `shared/types/index.ts`.

---

## 4. Comando executado

```bash
pnpm tsc --noEmit
```

Exit code: **2** (erros de compilação).

---

## 5. Lista final de erros TypeScript (por categoria)

### Resumo por tipo

- **TS2307** – Cannot find module: imports para `../core/logger`, `../core/env`, `../core/errors`, `../core/types`, `../db`, etc.
- **TS2322 / TS2345 / TS2339** – incompatibilidade de tipos, propriedade inexistente, argumento incorreto.
- **TS2724** – has no exported member (ex.: `insertLeoActionLog`, `taskQueue`, `leoOcr`, `EventType`).
- **TS7031 / TS7006** – parâmetro com tipo implícito `any`.
- **TS2532 / TS18048** – Object possibly 'undefined', possibly 'undefined'.
- **TS2323 / TS2484** – Cannot redeclare / export conflicts (ex.: `leo-semantic-memory.ts`, `validation.ts`).
- **TS2769 / TS2353** – No overload matches / Object literal may only specify known properties.
- **TS2305** – Module has no exported member.
- **TS2308** – Module has already exported a member (shared/types).

### Contagem aproximada

- **client**: ~10 erros (retry-client, ContasPagar/ContasReceber, useLeoChat).
- **server/_core**: ~35 erros (context, error-handler, index, llm, oauth, requireAdmin, resilient-pool, retry-client, sdk, system-monitor, validation, api-response).
- **server/db**: ~5 erros (db.ts, db/index.ts – tipos Pool/Database e schema LEO).
- **server/controllers, backup, cache, infra**: ~15 erros.
- **server/leo/** (actions, agent, desktop, engine, intelligence, learning, memory, operator, perception, planning, security, tasks, tools, utils): **~280+ erros** (módulos não encontrados, `insertLeoActionLog`, `registrarEvento`/`listarEventos` em LeoEvents, logger/core paths, tipos).
- **server/modules, services, middleware, tests**: ~60 erros.
- **shared/types**: 2 erros (re-export duplicado LeoEvent, LeoTask).

**Total estimado: ~400+ erros.**

### Arquivos com mais erros (amostra)

- `server/leo/` (diversos): imports `../core/logger`, `../../db` (insertLeoActionLog), API LeoEvents/LeoEngine incompatível.
- `server/_core/validation.ts`: redeclaração de schemas, Zod v4 (errorMap / enum).
- `server/_core/error-handler.ts`: assinatura de logger (Error vs string).
- `server/db/index.ts`: tipo Database vs schema LEO (Pg vs MySql2), Pool.
- `server/infra/redis.ts`: tipo Redis (namespace vs type), ioredis.
- `server/leo/memory/leo-semantic-memory.ts`: conflitos de export e tipos.
- `server/leo/security/leo-hardening.ts`: tipos Error vs string em logs.
- `shared/types/index.ts`: export duplicado de `LeoEvent` e `LeoTask`.

---

## 6. Próximos passos sugeridos

1. **Paths core**: criar alias em `tsconfig` para `"@core/*": ["./server/_core/*"]` e trocar imports `../core/...` por `@core/...`, ou substituir em massa `core/` por `_core/` nos imports do server.
2. **server/db**: centralizar exports em `server/db/index.ts` (ou em `server/db.ts`) e exportar funções esperadas (`insertLeoActionLog` via serviço ou re-export) ou atualizar todos os call sites para usar a API atual do DB.
3. **Leo (events, engine, tasks)**: alinhar exports dos módulos (default vs named) e assinaturas (ex.: `registrarEvento` vs `listEvents`, `taskQueue` vs `leoTaskQueue`).
4. **shared/types**: remover ou renomear re-export duplicado de `LeoEvent` e `LeoTask` em `shared/types/index.ts`.
5. **Logging**: padronizar assinatura dos loggers (ex.: segundo parâmetro `Error | string`) em `_core` e infra.
6. **Zod v4**: ajustar schemas em `_core/validation.ts` (enums e opções) para a API do Zod 4.

---

*Gerado a partir de `pnpm tsc --noEmit` e análise do repositório.*
