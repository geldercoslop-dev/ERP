# Domain Evolution Guide - schema.ts como Contrato

## PRINCÍPIO FUNDAMENTAL

**schema.ts é CONTRATO DE DOMÍNIO, não reflexo do DB**

- DB executa, schema define
- Alterações estruturais só via decisão de domínio explícita
- Fluxo unidirecional: domain decision → schema.ts → migration → DB
- PROIBIDO: DB → schema (introspect como fonte primária)

---

## FLUXO DE EVOLUÇÃO CONTROLADA

### Passo 1: Decisão de Domínio

Antes de qualquer alteração estrutural:

1. **Identificar a necessidade de negócio**
   - Qual funcionalidade precisa ser adicionada?
   - Qual regra de domínio está mudando?
   - Qual impacto nos dados existentes?

2. **Documentar a intenção**
   - Criar ISSUE descrevendo a mudança
   - Justificar a alteração estrutural
   - Avaliar impacto em migrations
   - Obter aprovação de arquitetura

3. **Planejar a migração**
   - Dados existentes precisam de transformação?
   - Há risco de perda de dados?
   - Precisa de rollback strategy?

---

### Passo 2: Alterar schema.ts (CONTRATO)

1. **Editar `drizzle/schema.ts` manualmente**
   - Adicionar/remover tabelas conforme decisão de domínio
   - Adicionar/remover colunas conforme necessidade de negócio
   - Adicionar/remover índices conforme performance/consultas
   - Manter consistência com regras de multi-tenant

2. **Regras de edição**
   - ✅ Edição manual e consciente
   - ✅ Comentários explicando propósito de cada campo
   - ✅ Manter nomenclatura consistente
   - ❌ NUNCA usar introspect para gerar
   - ❌ NUNCA copiar de DB automaticamente

3. **Validar multi-tenant**
   - Tabelas de domínio devem ter `tenantId` quando aplicável
   - Foreign keys para `tenants` devem ser explícitas
   - Validação em service layer é obrigatória

---

### Passo 3: Gerar Migration (DIFF)

```bash
pnpm run db:generate
```

1. **Revisar o SQL gerado**
   - Verificar se reflete exatamente a intenção de domínio
   - Checar se há operações perigosas (DROP, ALTER irreversível)
   - Validar se dados existentes serão preservados
   - Testar em ambiente de dev

2. **Se o SQL não estiver correto**
   - Revisar schema.ts
   - Ajustar manualmente se necessário
   - Gerar migration novamente

3. **Documentar a migration**
   - Adicionar comentário no topo do arquivo SQL
   - Explicar propósito e impacto
   - Referenciar a ISSUE original

---

### Passo 4: Aplicar Migration

```bash
pnpm run db:migrate
```

1. **Em ambiente de dev**
   - Aplicar migration
   - Testar funcionalidades afetadas
   - Verificar consistência de dados
   - Validar performance

2. **Em staging (se aplicável)**
   - Aplicar migration em staging
   - Testar com dados de produção
   - Validar rollback strategy

3. **Em produção**
   - Backup do DB antes de aplicar
   - Aplicar migration em janela de manutenção
   - Monitorar logs e erros
   - Ter rollback pronto

---

### Passo 5: Atualizar Documentação

1. **Atualizar `BASELINE_LOCKED.md`**
   - Incrementar versão (v1.0 → v1.1)
   - Documentar mudanças estruturais
   - Atualizar hash do schema se necessário

2. **Atualizar este guia se houver mudanças de processo**

---

## EXEMPLO PRÁTICO

### Cenário: Adicionar campo de observações em produtos

#### 1. Decisão de Domínio
- **Necessidade**: Vendedores precisam adicionar notas sobre produtos
- **Impacto**: Baixo (apenas adição de campo)
- **Migration**: Adicionar coluna `observacoes` (text, nullable)

#### 2. Alterar schema.ts
```typescript
export const produtos = mysqlTable(
  "produtos",
  {
    id: int("id").primaryKey().autoincrement(),
    descricao: text("descricao").notNull(),
    marca: varchar("marca", { length: 255 }),
    fornecedor: varchar("fornecedor", { length: 255 }),
    categoria: varchar("categoria", { length: 100 }),
    custo: decimal("custo", { precision: 10, scale: 2 }).default('0.00').notNull(),
    estoque: text("estoque").default('0').notNull(),
    ativo: text("ativo").default('1').notNull(),
    observacoes: text("observacoes"), // NOVO: campo para notas do vendedor
    createdAt: timestamp("createdAt", { mode: 'string' }).default('now()').notNull(),
    updatedAt: timestamp("updatedAt", { mode: 'string' }).default('now()').notNull(),
  },
  (table) => ({
    marcaIdx: index("marca_idx").on(table.marca),
  }),
);
```

#### 3. Gerar Migration
```bash
pnpm run db:generate
```

#### 4. Revisar SQL
```sql
-- Migration gerada deve conter:
ALTER TABLE `produtos` ADD COLUMN `observacoes` text;
```

#### 5. Aplicar e Testar
```bash
pnpm run db:migrate
# Testar criação/edição de produtos com observações
```

#### 6. Documentar
- Atualizar BASELINE_LOCKED.md para v1.1
- Documentar adição do campo

---

## REGRAS DE MULTI-TENANT

### Tabelas que DEVEM ter tenantId

- **vendedores** - já tem tenantId ✅
- **users** - já tem tenantId ✅
- **clientes** - PRECISA adicionar tenantId (fase 4)
- **pedidos** - PRECISA adicionar tenantId (fase 4)
- **produtos** - PRECISA adicionar tenantId (fase 4)
- **itens_pedido** - herda via pedido (indireto)
- **cargas** - PRECISA adicionar tenantId (fase 4)

### Tabelas que NÃO precisam de tenantId

- **tenants** - tabela de tenants
- **counters** - sistema global
- **cores** - catálogo global
- **grupos_precificacao** - pode ser global ou por tenant (decisão de domínio)

### Validação em Service Layer

Toda operação em tabelas com tenantId deve:
1. Receber tenantId do contexto
2. Validar que tenantId está presente
3. Filtrar queries por tenantId automaticamente
4. Lançar erro se tenantId for inválido

---

## OPERAÇÕES BLOQUEADAS

❌ `drizzle-kit introspect` (DESATIVADO)
❌ `pnpm run db:introspect:deterministic` (DESATIVADO)
❌ Overwrite automático de schema.ts
❌ Alterações em schema.ts sem decisão de domínio
❌ Migrations sem revisão manual
❌ Aplicar migration em produção sem backup

---

## OPERAÇÕES PERMITIDAS

✅ Edição manual de schema.ts com intenção de domínio
✅ `pnpm run db:generate` para criar migrations
✅ `pnpm run db:migrate` para aplicar migrations
✅ Revisão manual de SQL gerado
✅ Rollback para baseline se necessário

---

## TROUBLESHOOTING

### Migration gerada está vazia
- **Causa**: schema.ts já está em sync com DB
- **Ação**: Nada a fazer, estado consistente

### Migration gerada tem operações inesperadas
- **Causa**: schema.ts divergiu do DB sem intenção
- **Ação**: Revisar schema.ts, verificar se alterações foram acidentais
- **Rollback**: Restaurar schema.ts do git se necessário

### Erro ao aplicar migration
- **Causa**: DB em estado inconsistente
- **Ação**: Verificar estado atual do DB, revisar migration
- **Rollback**: Usar migration DOWN se disponível

---

## ASSINATURA

**Criado por:** Cascade AI
**Data:** 2026-04-25
**Versão:** v1.0
**Status:** ✅ ATIVO
