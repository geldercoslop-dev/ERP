# DATABASE IMMUTABLE LAYER v1

## STATUS: ✅ ATIVO

**Data de ativação:** 2026-04-26T03:22:18.487Z

---

## PRINCÍPIOS FUNDAMENTAIS

1. **DB é a única fonte de verdade**
   - schema.ts é apenas reflexo do estado real do banco
   - Nenhuma decisão estrutural vem do schema.ts
   - Drizzle não pode inferir renames ou mudanças

2. **schema.ts = espelho do DB**
   - 1:1 mapping exato
   - Sem renomeação automática
   - Sem "melhoria de nome"
   - Sem inferência de intenção

3. **Fluxo de mudança**
   - Migration explícita → DB → schema.ts (via script)
   - Nunca: schema.ts → DB (proibido)
   - Nunca: Drizzle introspect automático (proibido)

---

## BASELINE

- **Tabelas:** 19
- **Colunas:** 191
- **Índices:** 66
- **Foreign Keys:** 22
- **Constraints:** 47

### Tabelas do baseline

1. cargas
2. clientes
3. comissoes
4. contas_fixas
5. contas_pagar
6. contas_receber
7. cores
8. counters
9. fornecedores
10. grupos_precificacao
11. itens_pedido
12. pedidos
13. pedidos_carga
14. pendencias_compra
15. plano_contas
16. produtos
17. tenants
18. users
19. vendedores

---

## FERRAMENTAS

### Gerar schema.ts a partir do DB
```bash
npx tsx scripts/db/generate-immutable-schema.ts
```

### Verificar drift
```bash
npx tsx scripts/db/drift-guard.ts
```

### Gerar migration (apenas após mudança manual no DB)
```bash
npx drizzle-kit generate
```

---

## REGRAS DE EVOLUÇÃO

### ✅ PERMITIDO
- Criar migration SQL manual
- Executar migration no DB
- Rodar `generate-immutable-schema.ts` para atualizar schema.ts
- Commitar migration + schema.ts atualizado

### ❌ PROIBIDO
- Editar schema.ts manualmente
- Rodar `drizzle-kit introspect` (usa inferência)
- Rodar `drizzle-kit push` (decisões automáticas)
- Deixar schema.ts fora de sync com DB

---

## DRIFT DETECTADO (Follow-up)

As seguintes tabelas existem no código mas NÃO no DB:

1. **pendencias** - usada em: pendencias.service.ts, pendencias-engine.ts
2. **configuracoes** - usada em: configuracoes.service.ts, configuracoes.tool.ts
3. **idempotencyKeys** - usada em: idempotency.ts
4. **auditLogs** - usada em: audit-service.ts, audit-log.service.ts
5. **financialIdempotency** - usada em: financial-idempotency.ts

**Ação necessária:**
- Criar migrations para estas tabelas se forem necessárias
- OU remover código que referencia tabelas inexistentes
- Isso é um problema de código, não de schema

---

## CONFIGURAÇÃO

### drizzle.config.ts
```typescript
{
  strict: true,
  verbose: false,
  schemaFilter: ["public"],
  tablesFilter: ["!__drizzle_migrations"],
}
```

### schema.ts header
```typescript
// DATABASE IMMUTABLE LAYER v1
// Fonte: Banco de dados (única fonte de verdade)
// Princípio: DB é fonte absoluta, schema.ts é reflexo exato
// Data baseline: 2026-04-26T03:22:18.487Z
// Tabelas: 19
//
// REGRAS IMUTÁVEIS:
// 1. DB é única fonte de verdade
// 2. schema.ts é reflexo 1:1 do DB (sem renomeação)
// 3. PROIBIDO: Drizzle inferir renames
// 4. PROIBIDO: schema.ts definir intenção
// 5. Toda mudança: migration explícita → DB → schema.ts
```

---

## VALIDAÇÃO

Para validar que o sistema está em conformidade:

```bash
# 1. Verificar drift
npx tsx scripts/db/drift-guard.ts

# 2. Tentar gerar migration (deve retornar "No SQL generated")
npx drizzle-kit generate

# 3. Se SQL for gerado, há drift - corrigir antes de commitar
```

---

## FIM DO LOOP INFINITO

Esta arquitetura elimina:

- ✅ Loop "volta o problema depois"
- ✅ Rename prompt infinito
- ✅ Drift invisível
- ✅ Inferência do ORM
- ✅ Decisões automáticas

O sistema agora é **determinístico**.
