# RelatÃ³rio: porta 3000 + auditoria de organizaÃ§Ã£o (somente anÃ¡lise)

**Data:** 2026-03-23

---

## Parte 1 â€” PadronizaÃ§Ã£o PORT=3000 e fim de referÃªncias a 3000

### Onde havia `3000` (resumo)

| Ãrea | Exemplos |
|------|----------|
| Backend | `server/_core/index.ts` fallback `env.PORT \|\| 3000` â†’ **3000** |
| Watchdog | `health-watchdog.ts` URL fixa `localhost:3004` â†’ **`127.0.0.1:${PORT\|\|3000}`** |
| CORS dev | `cors-policy.ts` entradas `localhost:3000` â†’ **removidas** (mantidas 3000/3001/3004 etc.) |
| Frontend | `client/src/config/app.ts`, `apiOrigin.ts`, `vite.config` (raiz e `client/`), proxy **3044 â†’ 3000** |
| Scripts / testes | `generate-env.ts`, `validate-production.mjs`, `stress-test.mjs`, `test-boot.js`, `test-server-prod.js`, `test-port-dynamic.cjs`, scripts `teste-*`, `test-monitoring`, `diag-infra.mjs`, BAT/PS1, `deployment/*`, docs |
| VariÃ¡veis de ambiente | `.env`, `.env.local`, `.env.production`, `.env.local.backup`: **PORT=3001 â†’ 3000**; exemplos `PORT=3000 â†’ 3000` |
| SubstituiÃ§Ã£o em massa | Regex `\b3000\b` â†’ `3000` em arquivos de texto (exceto binÃ¡rios) |

### CorreÃ§Ãµes manuais pÃ³s-substituiÃ§Ã£o

- **`fix-ports.ps1`:** substituiÃ§Ã£o gerou lista duplicada `3000,3000`; ajustado para `@(3000, 3001, 3002)` e mensagens.
- **`docs/DEVOPS_DIAGNOSTICO_DEV.md`:** texto â€œPortas 3000 e 3000â€ corrigido para descrever a porta padrÃ£o 3000.
- **`scripts/diag-infra.mjs`:** comentÃ¡rio e `findstr` alinhados (sem `3000` nos filtros).

### ExceÃ§Ã£o: â€œ0 referÃªnciasâ€ em HTML com base64

- `login_preview.html` e `client/src/pages/login_preview.html` ainda contÃªm a subcadeia `3000` **dentro de dados base64** em `<img src="data:image/png;base64,...">`. NÃ£o Ã© configuraÃ§Ã£o de porta; alterar quebraria a imagem. **ReferÃªncias funcionais a porta 3000: zero** nos tipos `.ts`, `.tsx`, `.js`, `.mjs`, `.md`, `.json`, `.example`, `.env*`, `.conf`, etc.

### ValidaÃ§Ã£o

- **`pnpm exec tsc -p tsconfig.server.json --noEmit`:** **OK** (exit 0 nesta sessÃ£o).
- **`pnpm run dev` + `http://localhost:3000/api/health`:** depende de MySQL/Redis e `.env` local; com **PORT=3000** nos `.env`, o servidor deve ouvir em **3000** (ou porta alternativa se 3000 estiver ocupada â€” comportamento jÃ¡ existente).

### CritÃ©rio de sucesso

| CritÃ©rio | Estado |
|----------|--------|
| 0 referÃªncias funcionais a 3000 | âœ” (exceto ruÃ­do em base64 nos HTML acima) |
| Health em 3000 | âœ” configuraÃ§Ã£o alinhada |
| `tsc` sem erro | âœ” |

---

## Parte 2 â€” Auditoria de organizaÃ§Ã£o (NÃƒO foi executada limpeza)

**Regra cumprida:** nenhum arquivo crÃ­tico foi apagado; apenas anÃ¡lise e classificaÃ§Ã£o.

### 1. Estrutura principal

| Pasta | ObservaÃ§Ã£o |
|-------|------------|
| `server/_core` | Ponto de entrada Express, Vite, loadEnv, contexto â€” **coerente**. |
| `server/services` | ServiÃ§os de domÃ­nio â€” **ok**. |
| `server/tools` | UtilitÃ¡rios/diagnÃ³stico â€” **ok**. |
| `server/infra` | Redis, logs, tracing â€” **ok**. |
| `server/scripts` | Scripts operacionais â€” **ok**; mistura `.ts`/`.mjs`/`.js` (legado). |
| `client/src` | `components`, `pages`, `hooks`, `services` â€” **alinhado** a SPA Vite. |
| `scripts/` (raiz) | Muitos utilitÃ¡rios e testes ad-hoc â€” **funcional** porÃ©m **denso**. |

**ConclusÃ£o arquitetural:** a Ã¡rvore **server/** estÃ¡ utilizÃ¡vel e reconhecÃ­vel; a raiz do repositÃ³rio acumula **artefatos histÃ³ricos** (relatÃ³rios, testes soltos, cÃ³pias).

### 2. Problemas observados (sem aÃ§Ã£o tomada)

| Tipo | Exemplo |
|------|---------|
| Duplicidade / cÃ³pia | Pasta `so pra ver/` com `server/_core` espelhado â€” risco de **divergÃªncia** com o cÃ³digo real. |
| Scripts duplicados | `scripts/teste-*.js` e `.mjs` com lÃ³gica similar â€” **manter** atÃ© validar qual Ã© referÃªncia. |
| Build | `dist/` â€” artefato de build; **nÃ£o** apagar em repositÃ³rio se for gerado no CI; confirmar `.gitignore`. |
| Logs | `logs/*.txt`, `*.log` na raiz â€” **seguro arquivar** apÃ³s backup, **nÃ£o** apagar em lote sem polÃ­tica. |
| RelatÃ³rios `.md` na raiz | Dezenas de relatÃ³rios pontuais â€” **ruÃ­do** para novos devs; **nÃ£o** crÃ­ticos para runtime. |

### 3. ClassificaÃ§Ã£o

| ClassificaÃ§Ã£o | Itens |
|---------------|--------|
| **Seguro sugerir (baixo risco)** | Mover relatÃ³rios `.md` soltos para `docs/archive/` **copiando** primeiro; nÃ£o apagar atÃ© revisÃ£o. |
| **Precisa validar antes** | Remover `so pra ver/`; unificar `teste-*.js` vs `teste-*.mjs`; qualquer exclusÃ£o em `scripts/`. |
| **NÃ£o mexer sem necessidade** | `server/_core`, `server/routers`, `server/config/env.ts`, `.env*`, `drizzle/`, `deployment/nginx.conf` em produÃ§Ã£o. |

### 4. SimulaÃ§Ã£o de impacto (por sugestÃ£o)

| SugestÃ£o | Impacto se apagasse sem validar |
|----------|----------------------------------|
| Apagar `so pra ver/` | Nenhum em rotas **se** nada importar; **incerto** sem `grep` de imports. |
| Apagar `dist/` | Build de produÃ§Ã£o some; **rebuild** obrigatÃ³rio. |
| Apagar logs | **Zero** impacto em cÃ³digo; perda de histÃ³rico. |

### 5. Nota geral do projeto (0â€“10), **honesta**

**Nota: 6,5 / 10**

**Motivos:** backend e client **estruturados** e o `tsc` valida; porÃ©m a **raiz do repo** mistura documentaÃ§Ã£o, scripts experimentais e cÃ³pias, o que **reduz previsibilidade** para onboarding e manutenÃ§Ã£o. Subir para **8+** exigiria consolidaÃ§Ã£o documentada de scripts, arquivo de relatÃ³rios antigos e remoÃ§Ã£o de duplicatas **apÃ³s** validaÃ§Ã£o em CI.

---

## ConfirmaÃ§Ã£o final (Parte 1)

ConfiguraÃ§Ã£o padronizada para **PORT 3000** como referÃªncia principal; **fallback** do servidor e **proxy Vite** apontam para **3000**; watchdog HTTP usa **`process.env.PORT`**. TypeScript do servidor **sem erros** na verificaÃ§Ã£o executada.

---

*Limpeza fÃ­sica de arquivos: **nÃ£o executada** nesta auditoria (Parte 2).*
