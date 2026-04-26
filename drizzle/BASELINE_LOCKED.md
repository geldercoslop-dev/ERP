# ERP BASE + INFRA LOCKED v2.0

## STATUS: 🔒 BASELINE LOCKED - DOMAIN CONTRACT ARCHITECTURE

**Data de congelamento:** 2026-04-25
**Versão:** v2.0 (Domain Contract Architecture)
**Schema:** 19 tabelas
**Migrations:** 0000_uneven_carnage.sql

---

## MUDANÇA ARQUITETURAL v1.0 → v2.0

### Novo Princípio: schema.ts como CONTRATO DE DOMÍNIO

**Antes (v1.0):**
- DB era fonte de verdade estrutural
- schema.ts era espelho do DB via introspect
- Introspect automático permitido

**Agora (v2.0):**
- schema.ts é CONTRATO DE DOMÍNIO
- DB executa, schema define
- Fluxo unidirecional: domain decision → schema.ts → migration → DB
- Introspect DESATIVADO como fonte primária

### Multi-Tenant Enforcement

**Tabelas com tenantId adicionado (regra de domínio):**
- `clientes` - tenantId obrigatório
- `pedidos` - tenantId obrigatório
- `produtos` - tenantId obrigatório
- `cargas` - tenantId obrigatório

**Já tinham tenantId:**
- `users` - tenantId obrigatório
- `vendedores` - tenantId obrigatório

---

## MODO DE OPERAÇÃO: BASELINE LOCKED

### Regras de Ouro

1. **schema.ts é CONTRATO DE DOMÍNIO**
   - schema.ts é fonte de verdade estrutural do domínio
   - DB executa, schema define
   - Alterações só via decisão de domínio explícita
   - Fluxo: domain decision → schema.ts → migration → DB

2. **DB não pode sobrescrever schema.ts**
   - PROIBIDO: `drizzle-kit introspect` como fonte primária
   - PROIBIDO: Overwrite automático de schema.ts
   - PROIBIDO: Introspect automático em qualquer ambiente
   - schema.ts só pode ser alterado manualmente com intenção explícita

3. **drizzle-kit generate só manual**
   - Só pode rodar com intenção explícita de criar nova migration
   - Requer revisão do SQL gerado antes de aplicar
   - Requer atualização deste documento

4. **Migrations são evolução explícita**
   - Cada migration deve ter propósito documentado
   - Cada migration deve ser testada em ambiente de dev
   - Migrations só via processo controlado

5. **PROIBIDO introspect como fonte primária**
   - Introspect foi DESATIVADO como parte da arquitetura
   - Nenhum script pode usar introspect automaticamente
   - Para diagnóstico manual: use com cuidado em dev apenas

---

## TABELAS CONGELADAS (25)

### Tabelas Originais (19)
- cargas
- clientes
- comissoes
- contas_fixas
- contas_pagar
- contas_receber
- cores
- counters
- fornecedores
- grupos_precificacao
- itens_pedido
- pedidos
- pedidos_carga
- pendencias_compra
- plano_contas
- produtos
- tenants
- users
- vendedores

### Tabelas Adicionadas (Domain Contract v2.0)
- clienteVendedores - vinculo cliente-vendedor com tenantId
- idempotencyKeys - controle de idempotência
- boletos - boletos de pagamento com tenantId
- caixaMensal - caixa mensal com tenantId
- promocoes - promoções com tenantId
- promocoesItens - itens de promoção

---

## ESTADO ATUAL

### Schema.ts
- **Arquivo:** `drizzle/schema.ts`
- **Linhas:** 496
- **Tabelas:** 25 (19 originais + 6 adicionais)
- **Arquitetura:** Domain Contract (v2.0)
- **Multi-tenant:** Enforced em 11 tabelas (clientes, pedidos, produtos, cargas, users, vendedores, clienteVendedores, boletos, caixaMensal, promocoes, promocoesItens)
- **Tabelas adicionadas:** clienteVendedores, idempotencyKeys, boletos, caixaMensal, promocoes, promocoesItens
- **Hash SHA256:** [gerar no próximo commit]

### Migrations
- **Arquivo:** `drizzle/0000_uneven_carnage.sql`
- **Status:** Gerado do estado atual do schema
- **Aplicado:** [verificar status no DB]

### Meta
- **Journal:** `drizzle/meta/_journal.json`
- **Snapshot:** `drizzle/meta/0000_snapshot.json`
- **Versão:** 7

### Drizzle Config
- **Arquivo:** `drizzle.config.ts`
- **Strict mode:** ATIVO
- **Verbose:** ATIVO

---

## PROCEDIMENTO DE ROLLBACK

### Ponto de Retorno Seguro

Se algo der errado, retornar para este estado:

1. **Restaurar schema.ts**
   ```bash
   git checkout HEAD -- drizzle/schema.ts
   ```

2. **Restaurar migrations**
   ```bash
   git checkout HEAD -- drizzle/*.sql
   ```

3. **Restaurar meta**
   ```bash
   git checkout HEAD -- drizzle/meta/
   ```

4. **Reverter DB** (se migration foi aplicada)
   - Usar migration DOWN correspondente
   - Ou restaurar backup do DB

5. **Verificar consistência**
   ```bash
   npx drizzle-kit generate
   # Deve gerar migration vazia (sem mudanças)
   ```

---

## COMO FAZER MUDANÇAS (APENAS SE NECESSÁRIO)

### Processo Controlado

1. **Justificar a mudança**
   - Documentar motivo em ISSUE ou PR
   - Obter aprovação de arquitetura

2. **Alterar schema.ts manualmente**
   - Fazer mudanças conscientes
   - Manter consistência com DB existente

3. **Gerar migration**
   ```bash
   npx drizzle-kit generate
   ```

4. **Revisar SQL gerado**
   - Verificar se está correto
   - Testar em ambiente de dev

5. **Aplicar migration**
   ```bash
   npx drizzle-kit migrate
   ```

6. **Atualizar este documento**
   - Atualizar versão (v1.1, v1.2, etc.)
   - Documentar mudanças
   - Atualizar hash do schema

---

## REGRA DE SEGURANÇA

### Operações BLOQUEADAS

❌ `drizzle-kit introspect` em produção
❌ Overwrite automático de schema.ts
❌ `drizzle-kit generate` sem revisão
❌ Alterações em schema.ts sem intenção explícita
❌ Migrations sem teste em dev

### Operações PERMITIDAS

✅ `drizzle-kit generate` manual com intenção
✅ Alterações manuais em schema.ts com aprovação
✅ Migrations testadas e revisadas
✅ Rollback para estado baseline

---

## ALERTAS

Se qualquer script tentar:
- Rodar introspect automaticamente
- Sobrescrever schema.ts sem confirmação
- Gerar migration sem validação

→ **SISTEMA DEVE ALERTAR E BLOQUEAR**

---

## ASSINATURA

**Congelado por:** Cascade AI
**Data:** 2026-04-25
**Versão:** v2.0 (Domain Contract Architecture)
**Motivo:** Estabilização da base + infra do ERP com schema.ts como contrato de domínio
**Próxima revisão:** Quando necessário para evolução controlada

---

## DOCUMENTAÇÃO RELACIONADA

- `drizzle/DOMAIN_EVOLUTION_GUIDE.md` - Guia de evolução controlada do schema
- `drizzle/schema.ts` - Contrato de domínio (fonte de verdade estrutural)
- `scripts/db/introspect-deterministic.mjs` - DESATIVADO (marcado como deprecated)
