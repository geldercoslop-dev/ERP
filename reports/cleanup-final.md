# Relatório final — faxina controlada ERP

**Data:** 2026-03-23  
**Critério de sucesso:** sistema continua a compilar, `dev` sobe, `GET /api/health` retorna 200, sem regressão intencional.

---

## O que foi removido (definitivo)

| Item | Descrição |
|------|-----------|
| Pasta **`so pra ver/`** | Cópia paralela do projeto (incluía `package.json`, `server/`, `node_modules/`). Não era importada pelo app; apenas ignorada no ESLint e listada como importer no lockfile. |
| **Artefatos na raiz** (via `_trash/batch1-artifacts/`, depois apagados) | Logs e saídas de depuração: `debug-output.log`, `destructor-test-output.log`, `scenario-test.log`, `validate-output.log`, `server.log`, `server.err`, `server-output.log`, `server-error.log`, `_listen*.log`. |
| **Saídas de typecheck / tsc** | `tsc-errors.txt`, `tsc-out.txt`, `tsc-output.txt`, `tsc_result.txt`, `typecheck-output.txt`, `typecheck-result.txt`. |
| **Cache Vite** | `vite.config.ts.timestamp-*` (ficheiro gerado automaticamente). |

---

## O que foi mantido (escopo consciente)

- **Todo o código de aplicação:** `server/`, `client/`, `instrument.ts`, configs (`tsconfig*`, `vite.config.ts`, `drizzle.config.ts`, etc.).
- **`scripts/`** completo — muitos ficheiros não estão no `tsc` do servidor, mas são usados por `package.json`, testes manuais ou documentação; **não** foram apagados pares `.js`/`.mjs` sem auditoria.
- **Documentação** em `docs/`, relatórios históricos na raiz (dezenas de `.md`) — classificados como **revisão manual** no plano; não consolidados nem apagados nesta passagem.
- **Scripts soltos na raiz** (`audit-*.mjs`, `FINAL_*.mjs`, testes de carga, etc.) — mantidos até haver inventário de uso por equipa.

---

## Alterações de código (não remoções)

| Ficheiro | Alteração |
|----------|-----------|
| `eslint.config.mjs` | Removida entrada de ignore `so pra ver/**` (pasta já inexistente). |
| `package.json` | `test:login`: `tsx test-login.js` → `tsx scripts/test-login.js` (caminho correto para o ficheiro existente). |
| `pnpm-lock.yaml` | Regenerado por `pnpm install` após remoção do pacote/workspace `so pra ver`. |

---

## Riscos evitados

1. **Não apagar `scripts/` à sorte** — excluídos do `tsconfig.server.json`; remoção poderia quebrar `pnpm run` e fluxos documentados.
2. **Não apagar relatórios `.md` na raiz** — valor histórico; duplicação temática não implica ficheiro órfão de build.
3. **Remover `so pra ver` só após confirmar ausência de imports** e **correr `pnpm install`** para não deixar lockfile inconsistente.
4. **Validar após cada grupo** — `tsc`, servidor de desenvolvimento e health check antes de eliminar `_trash`.

---

## Antes vs depois

| Aspeto | Antes | Depois |
|--------|--------|--------|
| Pastas duplicadas | `so pra ver/` com cópia completa + dependências | Removida |
| Importers no lockfile | `.`, `client`, `so pra ver` | `.`, `client` |
| Artefatos na raiz | Múltiplos `.log` e `.txt` de debug/tsc | Removidos |
| Script `test:login` | Caminho incorreto para `test-login.js` | Aponta para `scripts/test-login.js` |
| Typecheck servidor | OK | OK |
| Health `/api/health` | Esperado 200 em dev | **200** (validado após alterações) |

---

## Comandos de validação utilizados

```text
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm install
pnpm run dev
GET http://localhost:3000/api/health  → 200
```

---

## Próximos passos opcionais (fora desta faxina)

- Consolidar relatórios `.md` repetidos na raiz numa pasta `docs/` ou `docs/archive/`.
- Auditar pares `scripts/*.js` vs `scripts/*.mjs` e remover duplicados legados com referência cruzada.
- Atualizar links em documentação que ainda mencionem `so pra ver/` (ex.: `docs/SUMARIO_ESTABILIZACAO_EXECUTIVO.md`).
