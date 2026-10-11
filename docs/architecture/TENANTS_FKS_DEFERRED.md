# Decisão P22 — FKs físicas tenants adiadas

## Contexto
- Commit base: 174b08c9c (`schema: restore tenants master table`)
- `tenants` restaurada como master table lógica (migration 0009, sem FOREIGN KEY)
- Suíte geral verde: 37/37
- `schema-consistency` verde: 66/66
- Auditoria de origem: P22-AUDIT-FKS-FUTURE

## FKs adiadas
- `users.tenant_id` → `tenants.id`
- `vendedores.tenant_id` → `tenants.id`

## Motivo da decisão
- tenantIds arbitrários/dinâmicos nos testes (proposital para isolamento A/B):
  `0, 1, 2, 99, 997, 998, 999, 99999, 9090, 9191, 99001, 99002, 99003, 990002, 999999`
- Órfãos reais no DB dev (verificado read-only):
  - `users`: 4 rows @997 + 22 rows @999
  - `vendedores`: 5 rows @997 + 22 rows @999
- MySQL valida dados existentes no `ADD CONSTRAINT` — DDL falharia imediatamente
- FK física agora quebraria a suíte no primeiro insert de fixture sem row pai

## Decisão
- Não criar FK física agora
- Manter integridade como contrato lógico via services/guards/testes:
  `schema-runtime-guard`, `boot-validation.service`, `schema-consistency.test`
- Manter `tenants` como master table lógica

## Pré-condições para futura FK
1. Cleanup ou seed de tenants pais para `997`/`999` no DB dev
2. Harness de testes provisionando row em `tenants` para cada tenantId usado
3. Normalização dos testes que usam tenantIds arbitrários
4. Auditoria equivalente no banco de produção (órfãos podem existir lá)
5. Plano de rollback antes de qualquer DDL
6. Migration formal em fase própria
7. Suíte geral verde antes/depois

## Gatilho de reavaliação
- Quando o harness multi-tenant provisionar tenants pais automaticamente
- Ou quando for decidido endurecer integridade física de `tenant_id`

## O que NÃO fazer agora
- Não adicionar `FOREIGN KEY` em `users`/`vendedores`
- Não seedar IDs de teste de forma frágil só para passar FK
- Não criar divergência dev/prod de schema
- Não alterar schema verde sem auditoria
