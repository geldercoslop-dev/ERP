# Entrega — Fase 3: Security Audit + Commands + Idempotência + Blindagem

## 1. Lista de arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `docs/SECURITY_FULL_AUDIT.md` | **Novo.** Inventário completo de routers tRPC, procedures, rotas REST, e análise por endpoint (admin/vendedor, filtro, ownership, vendedorId forçável). |
| `docs/LOGIN_SECURITY_AUDIT.md` | **Novo.** Checklist de validação do login (cookie, auth.me, guards, rotas sem login). |
| `docs/PERFORMANCE_AUDIT.md` | **Novo.** Índices, N+1, paginação server-side, listas completas. |
| `docs/ENTREGA_FASE3_SECURITY_COMMANDS.md` | **Novo.** Este documento. |
| `server/_core/requireAdmin.ts` | **Novo.** Middleware Express que exige usuário admin (cookie/header). |
| `server/_core/index.ts` | Rota `/api/backup/download` protegida com `requireAdmin`. |
| `server/_core/ownership.ts` | **Novo.** `assertOwnership(ctx, entity, entityId)` centralizado (pedido, conta_receber, boleto, cliente). |
| `server/_core/command.ts` | **Novo.** `executeCommand(options, handler)` com idempotência e transação; `commandResult(ok, changes, warnings)`. |
| `server/routers.ts` | Import de `assertOwnership`; substituição de checagens manuais por `assertOwnership` em getById, getItens, update, delete, updateStatus, gerarPDF, marcarEntregue (pedidos), marcarRecebida, delete (contasReceber), gerarPDF (boletos), update (clientes). createVenda e contasReceber.create com `idempotencyKey` opcional e gravação/leitura em `idempotency_keys`. |
| `server/db.ts` | Import de `idempotencyKeys`; funções `getIdempotencyResult(key)`, `setIdempotencyResult(key, commandName, resultJson, traceId, tx?)`. |
| `drizzle/schema.ts` | Tabela `idempotency_keys` (key, commandName, resultJson, traceId, createdAt). |
| `drizzle/0005_idempotency_keys.sql` | **Novo.** Migração para criar tabela `idempotency_keys`. |
| `server/tests/run-core-tests.ts` | Teste de idempotência: gravar e recuperar resultado por chave. |

---

## 2. Vulnerabilidades encontradas e corrigidas

| # | Severidade | Descrição | Correção |
|---|------------|-----------|----------|
| 1 | **CRÍTICA** | `/api/backup/download` sem autenticação — qualquer um podia baixar dump completo do banco. | Middleware `requireAdmin` em `server/_core/requireAdmin.ts`; rota exige cookie/header de admin. |
| 2 | Média | Validação de ownership espalhada e duplicada em vários procedures. | Centralizada em `assertOwnership(ctx, entity, entityId)` em `server/_core/ownership.ts`; procedures passaram a usar essa função. |
| 3 | Média | Ausência de idempotência em createVenda e contasReceber.create — retry/clique duplo podia duplicar pedido/conta. | Campo opcional `idempotencyKey` no input; tabela `idempotency_keys`; se chave já existir, retorna resultado armazenado; senão executa e grava. |

Outras recomendações (não aplicadas nesta entrega para não alterar contrato): contasPagar/contasFixas/caixaMensal como admin-only; boletos.gerarRelatorio como adminProcedure (conforme roadmap).

---

## 3. Confirmações explícitas

- **RBAC fechado:** Pedidos, clientes, contas a receber e boletos usam filtro por vendedor (list) e `assertOwnership` em getById/update/delete/gerarPDF/marcarRecebida. Nenhum procedure sensível retorna dados globais para vendedor. Input não permite forçar `vendedorId` nos fluxos críticos (createVenda e contasReceber.create usam apenas `ctx`).  
- **Idempotência ativa:** createVenda e contasReceber.create aceitam `idempotencyKey` opcional; ao receber, checam `getIdempotencyResult` e, se já executado, retornam o resultado gravado; após sucesso, gravam em `idempotency_keys` (createVenda dentro da mesma transação). Tabela e migração criadas.  
- **Transações:** createVenda já roda em transação; gravação da chave de idempotência em createVenda é na mesma transação. contasReceber.create não usa transação (uma única inserção); idempotência gravada após sucesso.  
- **Login não pode ser burlado:** Procedures protegidas usam `protectedProcedure`/`adminProcedure`; sem `ctx.user` não há acesso. REST sensível (`/api/backup/download`) exige admin via `requireAdmin`. Não há rota sensível acessível sem autenticação.

---

## 4. Checklist final para validação manual

- [ ] **Backup:** Sem login, GET `/api/backup/download` retorna 401. Com login admin, retorna ZIP. Com login vendedor, retorna 403.  
- [ ] **Ownership:** Como vendedor A, acessar pedido/conta/boleto de vendedor B (por ID) → 403 ou 404.  
- [ ] **Idempotência createVenda:** Enviar dois requests seguidos com o mesmo `idempotencyKey` e mesmos dados → segundo retorno igual ao primeiro, sem criar segundo pedido.  
- [ ] **Idempotência contasReceber.create:** Idem com `idempotencyKey` → segundo retorno igual ao primeiro, sem duplicar conta.  
- [ ] **Login:** Sem cookie/token, nenhuma procedure protegida deve retornar dados; auth.me retorna null.

---

## 5. Testes automatizados

- **npm run check:** Passou (TypeScript sem erros).  
- **npm run test:core:** Inclui teste de idempotência (gravar e recuperar chave). **Requer** que a migração `0005_idempotency_keys.sql` tenha sido aplicada (ou que a tabela `idempotency_keys` exista, ex.: via `db:push` em dev).

**Aplicar migração idempotency_keys (dev):**  
Executar o SQL em `drizzle/0005_idempotency_keys.sql` no banco ou rodar `npm run db:generate` e em seguida `npm run db:migrate` (se o projeto usar esse fluxo).

---

## 6. O que não foi alterado (conforme Parte 8)

- Schema: apenas **adição** da tabela `idempotency_keys` e migração correspondente; nenhuma alteração em tabelas/colunas existentes.  
- Uso de `db:push` em produção: não introduzido; fluxo de migração permanece o mesmo.  
- Auditoria: `insertAuditLog` e uso de `traceId` mantidos; em createVenda foi adicionado `traceId` no audit.  
- Lógica de estoque negativo: não alterada; núcleo ERRO ZERO intacto.
