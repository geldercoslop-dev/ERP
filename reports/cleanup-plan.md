# Plano de faxina controlada — ERP

**Data do mapeamento:** 2026-03-23  
**Objetivo:** reduzir ruído no repositório sem alterar o comportamento do sistema em produção/desenvolvimento.

---

## 1. Critérios de mapeamento

| Categoria | O que foi procurado |
|-----------|----------------------|
| Scripts soltos | Raiz do projeto e `scripts/` fora do fluxo `package.json` |
| `.md` duplicados | Mesmo tema com várias versões (ex.: FRONTEND_HARDENING_*) |
| Debug / artefatos | `.log`, saídas `tsc*.txt`, timestamps do Vite |
| Não importados | `server/**/*` via `tsconfig.server.json` (scripts e raiz excluídos do `tsc`) |

**Nota:** Arquivos em `scripts/` estão **excluídos** de `tsconfig.server.json`; não entram no `tsc -p tsconfig.server.json`. Removê-los não quebra o typecheck do servidor, mas pode quebrar **scripts npm** ou documentação que os invoque.

---

## 2. Arquivos e pastas suspeitos (inventário)

### 2.1 Pasta `so pra ver/` (cópia paralela do projeto)

- Cópia antiga com `package.json` próprio, `server/`, `drizzle/`, `node_modules/`.
- Referenciada em `eslint.config.mjs` (ignore) e como **importer** em `pnpm-lock.yaml` (`so pra ver:` junto com `.` e `client`).
- **Nenhum import** no código principal para este caminho (apenas documentação e auditorias).
- **Risco se mantiver:** divergência com o código real, lockfile e disco inflados.

### 2.2 Raiz do repositório — scripts e utilitários soltos

Dezenas de `.mjs`, `.js`, `.cjs`, `.ts` na raiz (auditorias, load tests, relatórios `FINAL_*`, `validate-*`, etc.).  
A maioria **não** é referenciada em `package.json` → úteis só para execução manual ou histórico.

**Referenciados em `package.json` (manter enquanto o script existir):**

- `instrument.ts`, `drizzle.config.ts`, `vitest.config.ts`, `vite.config.ts`
- `FINAL-VALIDATION-REAL.mjs` → script `validate:final`

### 2.3 `scripts/` — pares `.js` / `.mjs`

Exemplos: `teste-logs.js` + `teste-logs.mjs`, `teste-cache.js` + `teste-cache.mjs`, `teste-guerra-erp.js` + `.mjs`.  
O fluxo **mjs** costuma ser o usado por `teste-guerra-erp.mjs`; os `.js` podem ser legado.

### 2.4 Documentação `.md` na raiz (possível duplicação temática)

- Várias variantes **FRONTEND_HARDENING_*** (SUMMARY, SUMMARY_FINAL, COMPLETE, ENTERPRISE_*, etc.)
- Vários **PRODUCTION-AUDIT***, **WINDSURF***, **DESTRUCTOR***, relatórios de TypeScript, ENV, DEV vs PROD.

**Classificação:** não são “duplicados byte a byte”; são **iterações do mesmo tema** → fusão ou remoção exige decisão de produto/docs.

### 2.5 Arquivos TypeScript “soltos” na raiz

Ex.: `run-real-tests.ts`, `run-validation.ts`, `test-db.ts`, `test-compile.ts`, `test-ataque-completo.ts` — **fora** de `include` do `tsconfig.server.json` → não validados pelo `tsc` do servidor.

### 2.6 Bug conhecido (correção recomendada, não remoção)

- `package.json`: `"test:login": "tsx test-login.js"` — o arquivo existente é `scripts/test-login.js` (não há `test-login.js` na raiz). Script npm provavelmente **quebrado** até apontar para `scripts/test-login.js`.

### 2.7 Artefatos de build / debug (baixo risco)

- `*.log` na raiz e alguns em `logs/`
- `tsc-errors.txt`, `tsc-out.txt`, `tsc-output.txt`, `tsc_result.txt`, `typecheck-*.txt`
- `vite.config.ts.timestamp-*` (cache Vite)

---

## 3. FASE 2 — Classificação

### Seguro remover ou esvaziar (após validação)

| Item | Motivo |
|------|--------|
| Logs e saídas de compilação na raiz (`*.log` listados no plano, `tsc*.txt`, `typecheck*.txt`) | Artefatos regeneráveis; não importados |
| `vite.config.ts.timestamp-*` | Artefato de cache |
| Pasta `so pra ver/` | Cópia não usada pelo app; após remoção: `pnpm install` para alinhar lockfile |
| Conteúdo movido para `_trash/` após confirmação de testes | Política do utilizador |

### Revisar manualmente (não remover nesta faxina automática)

| Item | Motivo |
|------|--------|
| Pares `scripts/*.js` vs `scripts/*.mjs` | Ver qual é chamado por `teste-guerra-erp` e documentação |
| Dezenas de `.md` na raiz | Histórico / auditoria; possível consolidação em `docs/` |
| Scripts `.mjs` na raiz (`audit-*.mjs`, `FINAL_REPORT*.mjs`, etc.) | Podem ser usados por processos locais não mapeados |
| `*.jpeg`, `login-test.html`, `WhatsApp Image*` na raiz | Podem ser referências humanas; não apagar sem confirmar |

### Manter

| Item | Motivo |
|------|--------|
| `server/`, `client/`, `shared/`, `package.json`, lockfile, `tsconfig*`, `instrument.ts` | Núcleo do sistema |
| `scripts/` referenciados em `package.json` | DevOps e testes oficiais |
| `docs/`, `deployment/`, `reports/` (exceto novos relatórios de faxina) | Documentação |
| `docker-compose*.yml`, `ecosystem.config.*`, bats/ps1 usados pelo time | Operação |

---

## 4. Próximos passos (Fases 3–4)

1. Mover artefatos seguros para `_trash/` **ou** apagar diretamente após backup lógico.
2. Após cada grupo: `pnpm exec tsc -p tsconfig.server.json --noEmit`, `pnpm run dev`, `GET http://localhost:3000/api/health`.
3. Remover `so pra ver/`, atualizar `eslint.config.mjs`, executar `pnpm install`.
4. Corrigir `test:login` para `scripts/test-login.js`.
5. Se tudo estável: eliminar `_trash/` ou manter só o relatório final.

---

## 5. Estado antes da execução

- `pnpm exec tsc -p tsconfig.server.json --noEmit`: **OK** (baseline 2026-03-23).

---

## 6. Execução (2026-03-23)

- **Lote 1:** Artefatos movidos para `_trash/batch1-artifacts/` e pasta `_trash` removida após validação.
- **Lote 2:** Removida pasta `so pra ver/`; `pnpm install` regenerou o lockfile (importer `so pra ver` eliminado).
- **Ajustes:** `eslint.config.mjs` (removido ignore órfão); `package.json` → `test:login` apontando para `scripts/test-login.js`.
- **Validação:** `tsc` OK; `pnpm run dev` + `GET /api/health` → **200**.

Detalhes e antes/depois: `reports/cleanup-final.md`.
