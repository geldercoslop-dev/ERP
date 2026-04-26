# BASELINE ESTÁVEL DO ERP - V1
## Ponto de Restauração Oficial e Imutável

**Data de Criação:** 2026-04-25
**Versão:** V1
**Status:** ✅ ESTÁVEL - PRONTO PARA ROLLBACK

---

## PRINCÍPIOS DESTE BASELINE

- **NÃO alterar banco** - Este é um snapshot de referência apenas
- **NÃO alterar schema** - Schema.ts está congelado neste estado
- **NÃO alterar migrations** - Estado das migrations está registrado
- **NÃO alterar lógica de sistema** - Bootstrap flow está documentado
- **SOMENTE registrar estado atual** - Este é o ponto oficial de rollback

---

## FASE 1: ESTRUTURA DO BANCO DE DADOS

### Resumo do Banco
- **Database:** erp
- **Total de Tabelas:** 20
- **Total de Colunas:** 191
- **Total de Índices:** 66
- **Total de Foreign Keys:** 22
- **Total de Constraints:** 47

### Lista de Tabelas
1. __drizzle_migrations
2. cargas
3. clientes
4. comissoes
5. contas_fixas
6. contas_pagar
7. contas_receber
8. cores
9. counters
10. fornecedores
11. grupos_precificacao
12. itens_pedido
13. pedidos
14. pedidos_carga
15. pendencias_compra
16. plano_contas
17. produtos
18. tenants
19. users
20. vendedores

### Estado do __drizzle_migrations
- **Linhas na tabela:** 5
- **Engine:** InnoDB
- **Colunas:** id (bigint unsigned, auto_increment), hash (text), created_at (bigint)

### Detalhes de Estrutura
Ver arquivos detalhados em `.audit/baseline-inspection/`:
- `01-tables.json` - Informações completas de cada tabela
- `02-columns.json` - Todas as colunas com tipos e propriedades
- `03-indexes.json` - Todos os índices (BTREE)
- `04-foreign-keys.json` - Todas as 22 foreign keys
- `05-constraints.json` - Todas as constraints (PRIMARY, UNIQUE, FOREIGN KEY)

---

## FASE 2: ESTADO DO DRIZZLE

### Drizzle Meta Journal
```json
{
  "version": "7",
  "dialect": "mysql",
  "entries": [
    {
      "idx": 0,
      "version": "5",
      "when": 1771126029270,
      "tag": "0000_puzzling_mysterio",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "5",
      "when": 1771126757780,
      "tag": "0001_busy_vargas",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "5",
      "when": 1771129015413,
      "tag": "0002_gray_vengeance",
      "breakpoints": true
    },
    {
      "idx": 3,
      "version": "5",
      "when": 1771129208719,
      "tag": "0003_wild_hedge_knight",
      "breakpoints": true
    },
    {
      "idx": 4,
      "version": "5",
      "when": 1771130000000,
      "tag": "0004_add_aberta_cargas",
      "breakpoints": true
    }
  ]
}
```

### Snapshots Disponíveis
- `drizzle/meta/0000_snapshot.json` (2,702 bytes)
- `drizzle/meta/0001_snapshot.json` (39,691 bytes)
- `drizzle/meta/0002_snapshot.json` (53,183 bytes)
- `drizzle/meta/0003_snapshot.json` (57,177 bytes)
- `drizzle/meta/0009_snapshot.json` (81,909 bytes)
- `drizzle/meta/0019_snapshot.json` (131,874 bytes)
- `drizzle/meta/0020_snapshot.json` (138,055 bytes)

### Migrations SQL (gitignored)
- `drizzle/0000_puzzling_mysterio.sql`
- `drizzle/0001_busy_vargas.sql`
- `drizzle/0002_gray_vengeance.sql`
- `drizzle/0003_wild_hedge_knight.sql`
- `drizzle/0004_add_aberta_cargas.sql`

### Schema.ts Atual
**Arquivo:** `drizzle/schema.ts`
**Linhas:** 339
**Tabelas definidas:** 20 (cargas, clientes, comissoes, contas_fixas, contas_pagar, contas_receber, cores, counters, fornecedores, grupos_precificacao, itens_pedido, pedidos, pedidos_carga, pendencias_compra, plano_contas, produtos, tenants, users, vendedores)

**Principais características:**
- Usa drizzle-orm/mysql-core
- Todas as tabelas com timestamps (createdAt, updatedAt)
- Foreign keys com cascade/restrict apropriados
- Índices para performance (nome, telefone, status, etc.)
- Unique constraints onde necessário (cargas.numero, pedidos.numero, counters.name, users.openId)

---

## FASE 3: CONFIGURAÇÃO DE AMBIENTE

### Variáveis de Ambiente Críticas
**Arquivo de referência:** `.env.server.example`

**REQUIRED (sem fallback):**
- `DATABASE_URL` - Conexão MySQL
- `REDIS_URL` - Conexão Redis
- `JWT_ACCESS_SECRET` - Segredo JWT access
- `JWT_REFRESH_SECRET` - Segredo JWT refresh
- `JWT_SECRET` - Segredo JWT geral
- `SESSION_SECRET` - Segredo de sessão
- `APP_SECRET` - Segredo da aplicação

**Opcionais (com defaults):**
- `NODE_ENV` - development/production
- `PORT` - 3001 (default)
- `ALLOWED_ORIGINS` - CORS origins
- `REDIS_PASSWORD` - Senha Redis (opcional)
- `REDIS_BOOT_TIMEOUT_MS` - Timeout Redis (default 30000)

**Docker-only (não usado pela aplicação):**
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`

---

## FASE 4: BOOTSTRAP FLOW

### Entrypoints do Sistema

#### 1. server/index.ts (Principal)
- **Função:** validateProductionRuntime() - Previne tsx em produção
- **Bootstrap:** bootstrapServer() - Inicialização central
- **Startup:** startServer() - Inicia servidor HTTP
- **Proteção:** initializeServiceProtection() - Proteção de serviços

#### 2. server/cluster.ts (Cluster mode)
- Mesmo flow que index.ts
- Usa bootstrapServer() central
- Auto-healing integrado

#### 3. server/entry-main.ts (Test entry)
- Apenas para validação de compilação TypeScript
- Não usado em produção

### Bootstrap Central ÚNICO
**Arquivo:** `server/_core/bootstrap.ts`

**Ordem de Inicialização:**
1. ENV - loadEnv() (ZERO import-time side effects)
2. Validação ENV - validateRequiredEnv()
3. Database - waitForDatabaseReady() (CRÍTICO)
4. Redis - waitForRedis() (NÃO-crítico, modo DEGRADED aceito)
5. Runtime Health Check - runRuntimeHealthCheck()
6. Auto-heal loop (até 3 tentativas com backoff)
7. Marca bootstrap como completo

**Proteções:**
- `requireBootstrap()` - Lança erro se acessado antes do bootstrap
- `isBootstrapped()` - Verifica estado sem lançar erro
- `resetBootstrapForTesting()` - Reset apenas para testes

**Auto-Healing:**
- Tenta auto-repair de migrations se necessário
- Backoff exponencial (1s, 2s, 4s)
- Fail-fast após 3 tentativas

---

## FASE 5: DEPENDÊNCIAS CRÍTICAS

### Dependências Principais (package.json)
- **drizzle-orm:** ^0.44.5
- **drizzle-kit:** ^0.31.4
- **mysql2:** ^3.15.0
- **ioredis:** ^5.10.1
- **redis:** ^5.11.0
- **express:** ^4.21.2
- **@trpc/server:** ^11.6.0
- **@trpc/client:** ^11.6.0
- **typescript:** 5.9.3
- **tsx:** ^4.19.1

### Scripts Relevantes
- `pnpm run build` - Compila TypeScript
- `pnpm run dev` - Desenvolvimento com tsx
- `pnpm run start` - Produção (Node.js)
- `pnpm run db:push` - Push schema
- `pnpm run db:generate` - Generate migrations
- `pnpm run db:migrate` - Run migrations
- `pnpm run verify:system` - Verifica sistema completo
- `pnpm run typecheck` - Verifica TypeScript

---

## FASE 6: VALIDAÇÃO DO SNAPSHOT

### Checklist de Validação
- [x] Estrutura do banco capturada (20 tabelas, 191 colunas)
- [x] Estado do __drizzle_migrations registrado (5 migrations)
- [x] Drizzle meta journal documentado (versão 7, 5 entries)
- [x] Schema.ts atual capturado (339 linhas, 20 tabelas)
- [x] ENV crítico documentado (7 variáveis REQUIRED)
- [x] Bootstrap flow documentado (7 passos, auto-healing)
- [x] Entrypoints identificados (index.ts, cluster.ts, entry-main.ts)
- [x] Dependências críticas registradas

### Validação Executada (FASE 3)
- [x] TypeScript compilation - **431 erros em 37 arquivos**
- [ ] Sistema sobe normalmente - **PENDENTE (depende de correção TS)**
- [ ] DB conecta corretamente - **PENDENTE**
- [ ] Redis conecta corretamente - **PENDENTE**
- [ ] Migrations consistentes - **PENDENTE**
- [ ] Schema guard OK - **PENDENTE**

### Erros TypeScript Detectados
**Total:** 431 erros em 37 arquivos

**Principais categorias de erros:**
1. **Tipo mismatch em campos tinyint/boolean** - `ativo` espera number, recebe boolean
2. **Tipo mismatch em timestamp** - `updatedAt` espera string, recebe Date
3. **Exportações inexistentes no schema** - `clienteVendedores`, `idempotencyKeys` não existem
4. **Erros de tipo em queries Drizzle** - Múltiplos arquivos de serviços

**Arquivos mais afetados:**
- `server/services/orders.service.ts` - 52 erros
- `server/services/finance.service.ts` - 55 erros
- `server/services/logistica.service.ts` - 44 erros
- `server/services/inventory.service.ts` - 39 erros
- `server/services/clientes.service.ts` - 41 erros
- `server/db/core.ts` - 26 erros
- `server/routers.ts` - 22 erros

**NOTA CRÍTICA:** Este baseline captura o estado ATUAL do sistema, incluindo estes erros. Para rollback funcional, estes erros precisarão ser corrigidos ou o baseline precisará ser atualizado após correção.

---

## FASE 7: PROCEDIMENTO DE ROLLBACK

### Como Usar Este Baseline

**1. Para restaurar schema:**
```bash
# Verificar schema.ts atual
cat drizzle/schema.ts

# Comparar com baseline
diff drizzle/schema.ts .audit/baseline-inspection/schema-baseline-v1.ts
```

**2. Para restaurar migrations:**
```bash
# Verificar estado atual
cat drizzle/meta/_journal.json

# Comparar com baseline
diff drizzle/meta/_journal.json .audit/baseline-inspection/journal-baseline-v1.json
```

**3. Para restaurar banco:**
```bash
# Usar arquivos de inspeção como referência
# .audit/baseline-inspection/01-tables.json
# .audit/baseline-inspection/02-columns.json
# .audit/baseline-inspection/03-indexes.json
# .audit/baseline-inspection/04-foreign-keys.json
# .audit/baseline-inspection/05-constraints.json
```

**4. Para restaurar ENV:**
```bash
# Comparar com .env.server.example
# Garantir todas as variáveis REQUIRED estão presentes
```

---

## CRITÉRIOS DE SUCESSO

✅ **Estado atual preservado** - Todos os arquivos de referência criados
✅ **Rollback possível** - Procedimentos documentados
✅ **Sem alteração estrutural** - Nenhuma modificação feita no sistema
✅ **Sem impacto no sistema** - Apenas captura de estado

---

## CRITÉRIOS DE FALHA

❌ **Qualquer alteração de sistema** - Este baseline é READ-ONLY
❌ **Qualquer migração executada** - Migrations não foram rodadas
❌ **Qualquer schema modificado** - Schema.ts não foi alterado

---

## ASSINATURA DO BASELINE

**Criado por:** Cascade AI Assistant
**Data:** 2026-04-25
**Propósito:** Ponto de restauração oficial e imutável do ERP
**Status:** ⚠️ BASELINE ERP - V1 (COM ERROS TYPESCRIPT)

**OBSERVAÇÃO IMPORTANTE:**
Este baseline captura o estado ATUAL do sistema, que inclui 431 erros TypeScript em 37 arquivos. Este é um snapshot técnico fiel do estado atual, mas não representa um estado "estável" em termos de compilação TypeScript.

Para um baseline funcional (sem erros), é necessário:
1. Corrigir os 431 erros TypeScript
2. Reexecutar typecheck com sucesso
3. Criar novo baseline V2 pós-correção

---

## NOTAS IMPORTANTES

1. **Este baseline é IMUTÁVEL** - Não deve ser alterado
2. **Para criar novo baseline** - Criar novo arquivo com versão V2
3. **Validação completa** - Executar FASE 3 antes de considerar baseline válido
4. **Backup adicional** - Considerar backup do banco de dados completo
5. **Versionamento** - Usar controle de versão para rastrear mudanças

---

## PRÓXIMOS PASSOS

1. Executar validação completa (FASE 3)
2. Validar que sistema sobe normalmente
3. Validar conexões DB e Redis
4. Validar consistência de migrations
5. Validar schema guard
6. Marcar baseline como VALIDADO após sucesso
