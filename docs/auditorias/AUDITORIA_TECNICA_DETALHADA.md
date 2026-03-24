# 📌 AUDITORIA SEGURA — REFERÊNCIA TÉCNICA DETALHADA

**Gerado:** 19/03/2026  
**Validação:** ✅ tsc -p tsconfig.server.json --noEmit = 0 erros

---

## PARTE 1: LIBS PARA REMOVER (6 pacotes)

### 1. @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner

**Status:** ❌ SEM USO  
**Imports encontrados:** ZERO (confirmado grep search)  
**Implementação:** Nenhuma em `server/`  
**Tamanho:** ~7-8MB (com dependências)

```bash
# Remoção
pnpm remove @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Evidência de não-uso:**
```powershell
# Nenhum arquivo importa S3
grep -r "from.*@aws-sdk" server/
# Resultado: ZERO matches
```

---

### 2. autocannon

**Status:** ❌ SEM USO (Load testing)  
**Imports encontrados:** ZERO  
**Versão:** `^8.0.0`  
**Tamanho:** ~3MB

```bash
pnpm remove autocannon
```

**Nota:** Para load testing use `jmeter` ou `k6` (não integrado ao projeto)

---

### 3. streamdown

**Status:** ❌ SEM USO  
**Imports encontrados:** ZERO  
**Versão:** `^1.4.0`  
**Tamanho:** ~1MB

```bash
pnpm remove streamdown
```

---

### 4. uninstall

**Status:** ❌ SEM USO (Pacote genérico malformado)  
**Versão:** `^0.0.0` (Red flag!)  
**Tamanho:** <1KB

```bash
pnpm remove uninstall
```

**Nota:** Este é um pacote "dummy" - nunca deve estar em produção

---

### 5. np (se presente)

**Status:** ❌ SEM USO (CI/CD toolkit)  
**Versão:** Verificar  
**Tamanho:** ~5MB

```bash
# Remover se estiver
pnpm remove np
```

---

## PARTE 2: ROUTERS ORPHANED (10+)

### Estrutura Atual

```
server/routers/
├── admin/                      ✅ (admin/index.ts — verificar uso)
├── clientes.ts                 ❌ ORPHANED
├── clientes.router.ts          ❌ ORPHANED (via routes/clientes em uso)
├── financeiro.router.ts        ❌ ORPHANED (implementado inline em routers.ts)
├── leo-admin.ts                ❌ ORPHANED
├── leo-admin-dashboard.ts      ❌ ORPHANED
├── leo-admin-health.ts         ❌ ORPHANED
├── leo-api.ts                  ❌ ORPHANED
├── leo-insights.ts             ❌ ORPHANED
├── leo.router.ts               ❌ ORPHANED
├── leo.ts                       ❌ ORPHANED
├── logistica.ts                ❌ ORPHANED
├── pedidos.router.ts.broken    🔴 QUEBRADO
├── produtos.ts                 ❌ ORPHANED (via routes/produtos em uso)
├── produtos.router.ts          ❌ ORPHANED (via routes/produtos em uso)
├── smart-auth.ts               ❌ ORPHANED
└── [active routers in routers.ts main]
```

### Análise por Router

#### ❌ SMART-AUTH.TS

**Arquivo:** `server/routers/smart-auth.ts`  
**Export:** `export const smartAuthRouter = router({...})`  
**Ligação ao appRouter:** NÃO (não importado em `server/routers.ts`)  
**última atualização:** ~2025  
**Funções:** Auth avançada (provavelmente PoC)  

**Decisão:**
- [ ] Reativar: Copiar endpoints para `/auth` router em routers.ts
- [ ] Deletar: `rm server/routers/smart-auth.ts`

---

#### ❌ LEO-ADMIN*.TS (3 arquivos)

**Arquivos:**
- `leo-admin.ts` → `leoAdminRouter`
- `leo-admin-health.ts` → `leoAdminHealthRouter`
- `leo-admin-dashboard.ts` → `leoAdminDashboardRouter`

**Ligação:** ZERO (nunca importados em appRouter)  
**Status:** Modo "Leo" (IA/Insights) — *foi fase experimental*  
**Conteúdo:** Admin dashboard, monitoramento, health checks

**Decisão:**
- [ ] Reativar: Integrar ao `admin/` router principal
- [ ] Deletar: `rm server/routers/leo-admin*.ts`

---

#### 🔴 PEDIDOS.ROUTER.TS.BROKEN

**Arquivo:** `server/routers/pedidos.router.ts.broken`  
**Status:** QUEBRADO (extension `.broken`)  
**Ação:** ❌ DELETAR IMEDIATAMENTE

```bash
rm server/routers/pedidos.router.ts.broken
```

---

#### ⚠️ DUPLICATAS: CLIENTES + PRODUTOS

**Problema:** Dois arquivos para cada entidade

```
Clientes:
├── server/routers/clientes.ts
├── server/routers/clientes.router.ts
└── server/routes/clientes.ts       ← ATIVA (em uso)

Produtos:
├── server/routers/produtos.ts
├── server/routers/produtos.router.ts
└── server/routes/produtos.ts       ← ATIVA (em uso)
```

**Diagnóstico:** `server/routes/` é a versão ativa  
**Ação:** Deletar versões orphaned

```bash
rm server/routers/clientes.ts
rm server/routers/clientes.router.ts
rm server/routers/produtos.ts
rm server/routers/produtos.router.ts
```

---

#### ⚠️ FINANCEIRO.ROUTER.TS

**Arquivo:** `server/routers/financeiro.router.ts`  
**Status:** Orphaned EM ROUTERS.TS, mas funcionalidade ATIVA inline

**Explicação:** As rotas de financeiro estão implementadas DENTRO de `routers.ts` (pedidos.finalizarBaixa, etc), não em arquivo separado  
**Ação:** Manter inline, deletar arquivo

```bash
rm server/routers/financeiro.router.ts
```

---

#### ⚠️ LOGISTICA.TS

**Arquivo:** `server/routers/logistica.ts`  
**Service usado:** `logistica.service.ts` (verificado ativo)  
**Router status:** Não linkado a appRouter  
**Ação:** Decidir:
- [ ] Reativar logistica router (link ao appRouter)
- [ ] Manter apenas service, deletar router

```bash
# Se deletar:
rm server/routers/logistica.ts
```

---

#### ❌ LEO-*.TS (5 variações)

**Arquivos:**
- `leo-api.ts`
- `leo-insights.ts`
- `leo.ts`
- `leo.router.ts`

**Status:** Todos ORPHANED (não em appRouter)  
**Razão:** Fase "Leo" (IA mode) nunca integrada ao produto  
**Ação:** Consolidar ou deletar

```bash
# OPÇÃO A: Deletar todas
rm server/routers/leo*.ts

# OPÇÃO B: Revisar quais reutilizar
# (requer análise de features leo)
```

---

## PARTE 3: SERVICES ANALYSIS

### Services CRÍTICOS (MANTER ✅)

```typescript
// Em uso e importados:
import * as clientes from './routes/clientes';
import * as pedidos from './routes/pedidos';
import * as producoes from './routes/promocoes';
import * as db from './db';                    // CORE
import * as pdf from './pdf';                   // PDF + ZIP

// Services específicos:
services/logistica.service.ts          // db/index.ts
services/finance.service.ts            // routers.ts (pedidos)
services/stock-safety.service.ts       // _core/init-protection.ts
services/orders.service.ts             // AI services
services/system.service.ts             // monitoring
services/external-apis.ts              // monitoring/advanced
```

---

### Services DUPLICADAS (VERIFICAR ⚠️)

#### Audit Service

**Problema:**
```
server/services/audit-service.ts    ← Qual é ativa?
server/services/auditService.ts     ← Qual é ativa?
server/services/audit-service.ts.broken (arquivo quebrado?)
```

**Resolução:**
1. Grep para saber qual é realmente importada:
```powershell
grep -r "from.*audit" server/routers.ts
```
2. Usar apenas uma versão
3. Deletar as outras

---

#### Leo Services

**Múltiplas versões encontradas:**
```
server/services/leo/
├── leo-insights.service.ts
├── leo-service.ts
└── leo-screen.ts
```

**Status:** Não são importadas em routers.ts  
**Ação:** Revisar se são usadas em `leo-insights.ts` router ou deletar

---

### Services Antigos/Backup (Revisar)

```
server/services/
├── cached-clientes.service.ts       ⚠️ Versão antiga?
├── cached-inventory.service.ts      ⚠️ Versão antiga?
├── backup.service.ts                ⚠️ (vs backup.ts que está ativo)
└── [vs direciona a server/backup.ts para gerarBackupZip]
```

**Ação:** Grep para confirmar importação e deletar versões antigas

---

## PARTE 4: INTEGRATIONS STATUS

### Integrations NÃO USADAS

```
server/integrations/
├── ocr.ts                           ❌ NÃO IMPORTADO
├── whatsapp.ts                      ❌ NÃO IMPORTADO
└── [outros: sim, importados em external-apis]
```

**Decisão:**
- [ ] Manter (roadmap futuro)
- [ ] Deletar (sem plano)

---

## PARTE 5: CHECKLIST DE EXECUÇÃO

### Pré-Limpeza

- [ ] `git status` (confirmar clean working tree)
- [ ] `git log --oneline -5` (confirmar último commit útil)
- [ ] Backup: `git stash` (salvaguarda)

### Remover Libs (5 minutos)

```bash
cd c:\ERP

# Libs zero-use
pnpm remove @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm remove autocannon streamdown uninstall

# Verificar
pnpm install
```

### Deletar Arquivos Quebrados (1 minuto)

```bash
# Arquivo .broken
rm server/routers/pedidos.router.ts.broken

# [OPCIONAL] Deletar routers orphaned por categoria
# rm server/routers/smart-auth.ts
# rm server/routers/leo-admin*.ts
# rm server/routers/clientes.ts
# rm server/routers/clientes.router.ts
# rm server/routers/produtos.ts
# rm server/routers/produtos.router.ts
```

### Validar Tipos (3-5 minutos)

```bash
pnpm typecheck
# Resultado esperado: 0 erros ✅
```

### Build (5-10 minutos)

```bash
pnpm run build
# Resultado esperado: sem erro
```

### Teste Dev (2 minutos)

```bash
pnpm run dev:windows
# Ctrl+C para sair (apenas teste de boot)
```

### Commit

```bash
git add .
git commit -m "Auditoria: remover libs orphaned e código quebrado

- Remove: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, autocannon, streamdown, uninstall
- Delete: server/routers/pedidos.router.ts.broken
- Validado: tsc (0 errors), pnpm build (success)
- Ganho: ~15-20MB espaço disco"

git push origin main
```

---

## REFERÊNCIA: IMPORTS VERIFICADOS

### ✅ Confirmado em Uso

```
archiver           → server/backup.ts, server/pdf.ts ✔️
jose               → server/_core/sdk.ts ✔️
jsonwebtoken       → server/security/jwt-hardening.ts ✔️
bcryptjs           → server/routers.ts (getBcrypt()) ✔️
pino               → server services ✔️
ioredis            → server/infra/redis.ts, queue/ ✔️
@opentelemetry/*   → server/instrumentation ✔️
@sentry/*          → server/_core/index.ts ✔️
```

### ❌ Confirmado SEM Uso

```
@aws-sdk/*         → ZERO imports ✔️
autocannon         → ZERO imports ✔️
streamdown         → ZERO imports ✔️
uninstall          → ZERO imports ✔️
```

---

## 🎯 PRÓXIMAS ETAPAS

1. **Você aprova** as 3 categorias (manter, conectar, remover)
2. **Responde** 3 perguntas de decisão
3. **Eu executo** as remoções (ou você com guia)
4. **Validamos** juntos com tsc + build

---

**Fim da auditoria técnica detalhada**

