# ✅ CHECKLIST - PRÓXIMAS 24 HORAS

**Base:** Auditoria 27 Mar 2026 - 7 CRÍTICOS encontrados

---

## 🔴 EMERGÊNCIA (HOJE - 30 min)

### [ ] 1. Remover .env do Git
```bash
cd c:\ERP
git rm --cached .env .env.local .env.development
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.development" >> .gitignore
git add .gitignore
git commit -m "Remove .env from Git tracking"
git push
```
**Por que:** Segredos JWT expostos publicamente

---

### [ ] 2. Regenerar Secrets (JWT, APP_SECRET)
```
Gerar novos secrets (mínimo 64 chars):
openssl rand -base64 48 (copiar 64 primeiros chars)

.env file:
JWT_ACCESS_SECRET=(novo valor)
JWT_REFRESH_SECRET=(novo valor)
APP_SECRET=(novo valor)
SESSION_SECRET=(novo valor)

Depois: 
⚠️ REVOKE todos tokens antigos em produção
⚠️ Fazer re-login de todos usuários
```

---

### [ ] 3. Remover query param tenant-id fallback
**Arquivo:** `server/_core/context.ts` (linha ~110-115)

❌ ATUAL:
```typescript
const tenantId = 
  extractFromJwt(token) ||
  extractFromHeader(req) ||
  new URLSearchParams(req.url).get('tenantId'); // ❌ REMOVER
```

✅ ESPERADO:
```typescript
const tenantId = 
  extractFromJwt(token) ||
  extractFromHeader(req);

if (!tenantId) {
  throw new Error('Missing tenant-id in JWT or header');
}
```

---

### [ ] 4. Fixar orderService - Adicionar Auth
**Arquivo:** `client/src/services/orderService.ts` (linha ~15)

❌ ATUAL:
```typescript
export async function listOrders() {
  const response = await fetch(`${API_BASE}/orders`, {
    // SEM HEADERS
  });
}
```

✅ ESPERADO:
```typescript
export async function listOrders() {
  return await authenticatedFetch(`${API_BASE}/orders`, {
    method: 'GET',
  });
}
```

---

### [ ] 5. Fixar paymentService - Adicionar Auth
**Arquivo:** `client/src/services/paymentService.ts` (linha ~15)

Mesma mudança que orderService (vide acima)

---

**Total emergência:** 5 tarefas, ~30 minutos

---

---

## 🟠 HOJE À NOITE (próximas 2-3 horas)

### [ ] 6. Implementar Cache (Redis)
**Arquivo:** `server/_core/cache-decorator.ts` (novo ou existente)

✅ ESPERADO:
```typescript
export function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  // 1. Try Redis GET
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  // 2. Execute function
  const result = await fn();
  
  // 3. Set Redis with TTL
  await redis.setex(key, ttlSeconds, JSON.stringify(result));
  
  return result;
}
```

**Em Services:**
```typescript
export async function listClientes(tenantId: number) {
  return withRedisCache(
    `clientes:${tenantId}`,
    300, // 5 min TTL
    async () => {
      return db.select().from(clientes).where(...);
    }
  );
}
```

**TTLs recomendados:**
- Clientes: 5 min (300s)
- Produtos: 15 min (900s)
- Relatórios: 30 min (1800s)
- Pagamentos: 1 min (60s) - alto turnoiver

---

### [ ] 7. Remover Acesso Direto BD
**Arquivo:** `server/controllers/system-test.controller.ts`

❌ ATUAL:
```typescript
import { getDb, getPool } from '../db/index.ts';

export async function testHealth() {
  const pool = await getPool();
  const result = await pool.query('SELECT * FROM clientes WHERE tenant_id = ?', [123]);
}
```

✅ ESPERADO (refactor para usar Service):
```typescript
import { listClientes } from '../services/clientes.service.ts';

export async function testHealth() {
  const clientes = await listClientes(tenantId);
  return { success: true, count: clientes.length };
}
```

**OU deletar arquivo se não for usado em produção**

---

### [ ] 8. Validar Endpoints com Testes
```bash
# Depois de cada fix, fazer teste rápido:
curl -X GET http://localhost:3000/api/clientes \
  -H "Authorization: Bearer {token}" \
  -H "x-tenant-id: {tenantId}"

# Esperado: 200 OK com array de clientes em <200ms (com cache)
```

---

**Total hoje à noite:** 3 tarefas, ~2-3 horas

---

---

## 📋 AMANHÃ (próximas 4-6 horas)

### [ ] 9. Converter ANY Types
**Scope:** 100+ ocorrências em backend

Procurar:
```bash
grep -r "\bany\b" server/ --include="*.ts" | wc -l
# → Deve diminuir de 100+ para <10
```

**Prioridade de fix:**
1. **Crítica:** Middlewares (context.ts, request-middleware.ts)
2. **Alta:** Services (finance, clientes, orders)
3. **Média:** Utilities (_core/*)
4. **Baixa:** Testes, dev-only files

**Exemplo fix:**
```typescript
// ❌ ANTES
function onFailure(error: any) { ... }

// ✅ DEPOIS
function onFailure(error: Error | ClientError) { ... }
```

---

### [ ] 10. Adicionar Validação em Controllers Express
**Scope:** Controllers que ainda usam `any`

```typescript
// ✅ ESPERADO
import { z } from 'zod';

const createClientSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  tenant_id: z.number(),
});

export async function createClient(req: Request, res: Response) {
  // Validar input ANTES de chamar service
  const input = createClientSchema.parse(req.body);
  const result = await ClientService.create(input);
  res.json(result);
}
```

---

### [ ] 11. Ativar CSP Headers
**Arquivo:** `server/_core/index.ts` (Helmet config)

✅ ESPERADO:
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // se necessário
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      formAction: ["'self'"],
    },
  },
}));
```

---

### [ ] 12. Re-testar TypeScript
```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
# Esperado: 0 erros (não deve mudar)
```

---

**Total amanhã:** 4 tarefas, ~4-6 horas

---

---

## 🧪 VALIDAÇÃO FINAL (antes de deploy)

### [ ] Build Local
```bash
npm run build
# ou: pnpm run build
```

### [ ] Docker Build
```bash
docker compose build --no-cache
```

### [ ] Docker Up
```bash
docker compose up -d
# Aguardar 30s para healthchecks
docker compose ps
# Esperado: all "healthy"
```

### [ ] Health Check
```bash
curl http://localhost:3000/health
# Esperado: { "status": "healthy" }
```

### [ ] Auth Flow
```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "..."}'

# 2. Copy JWT token

# 3. Test endpoint with JWT
curl -X GET http://localhost:3000/api/clientes \
  -H "Authorization: Bearer {token}" \
  -H "x-tenant-id: 1"

# Esperado: 200 OK + array em <200ms
```

### [ ] Cache Validation
```bash
# 1ª request (sem cache):
time curl -X GET http://localhost:3000/api/clientes \
  -H "Authorization: Bearer {token}"
# ~500ms

# 2ª request (com cache):
time curl -X GET http://localhost:3000/api/clientes \
  -H "Authorization: Bearer {token}"
# ~50-100ms (não deve ir ao BD)
```

### [ ] Cross-Tenant Test
```bash
# Tentar acessar tenant=2 com token de tenant=1
curl -X GET http://localhost:3000/api/clientes \
  -H "Authorization: Bearer {token_from_tenant_1}" \
  -H "x-tenant-id: 2"

# Esperado: 403 Forbidden (ou 401 Unauthorized)
# ❌ NÃO DEVE: retornar dados de tenant 2
```

---

---

## 📊 ANTES / DEPOIS

### Score de Produção

```
MÉTRICA          | ANTES | DEPOIS | TARGET
─────────────────┼───────┼────────┼────────
Type Safety      | 80%   | 95%    | 100%
Security         | 70%   | 90%    | 100%
Performance      | 40%   | 85%    | 100%
Architecture     | 85%   | 95%    | 100%
API Spec         | 98%   | 98%    | 100%
─────────────────┼───────┼────────┼────────
TOTAL            | 75%   | 93%    | 100% ✅
```

### Status Go/No-Go

```
ANTES:  ❌ NÃO PRONTO (7 críticos)
DEPOIS: ⚠️ QUASE PRONTO (2 riscos residuais)
META:   ✅ PRONTO (staging first 48h, monitor)
```

---

---

## 🎯 SIGN-OFF

Once all items are checked:
```
FINAL STATUS: ✅ PRONTO PARA STAGING
```

**Próximo passo:** Deploy em staging environment por 48h, monitorar:
- [ ] Error rate <0.1%
- [ ] P99 latência <200ms
- [ ] Cache hit rate >80%
- [ ] Zero auth failures (exceto timeout)
- [ ] Nenhum cross-tenant leak

**Se OK em staging:** Fazer deploy em produção com rollback plan

---

**Data de Início:** 27 Mar 2026  
**Data Esperada de Conclusão:** 28 Mar 2026 (24h)  
**Status:** 🟡 EM PROGRESSO

---

**Próximo:** Executar itens 1-5 (emergência) HOJE

