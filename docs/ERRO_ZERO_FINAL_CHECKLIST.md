# Checklist Final — ERRO ZERO (TURBO 2)

Use este checklist para validar que o sistema está “redondo” antes de UI/PWA/deploy.

---

## RBAC

- [ ] **Vendedor não acessa nada de outro:** Logado como vendedor A, tentar acessar pedido/conta/boleto/cliente de vendedor B (por ID) → 403 ou 404.
- [ ] **Listas filtradas:** Listagens (pedidos, clientes, contas a receber, boletos) retornam apenas itens do vendedor logado.
- [ ] **Backup:** GET `/api/backup/download` sem auth → 401; com vendedor → 403; com admin → 200 e ZIP.

---

## Idempotência

- [ ] **Clique duplo não duplica pedido:** Dois requests seguidos com o mesmo `idempotencyKey` em `createVenda` → mesma resposta, um único pedido criado.
- [ ] **Clique duplo não duplica financeiro:** Dois requests com o mesmo `idempotencyKey` em `contasReceber.create` ou `baixarPedidoDireto` (marcarEntregue) → mesma resposta, uma única execução.
- [ ] **Concorrência:** Dois requests em paralelo com a mesma key → ambos recebem o mesmo resultado; handler executado uma vez (test:core cobre isso).

---

## Transação

- [ ] **Ações críticas atômicas:** createVenda, baixarPedidoDireto, contasReceber.create rodam em uma única transação (reserva idempotência + negócio + update resultado).
- [ ] **Rollback em erro:** Se qualquer passo falhar (ex.: estoque, constraint), nada é commitado (estoque e financeiro permanecem consistentes).
- [ ] **Audit/traceId:** Toda ação que altera núcleo (pedido, baixa, conta) registra audit_log com traceId quando aplicável.

---

## Backup e test:core

- [ ] **Backup admin-only:** Confirmado via middleware `requireAdmin` em `/api/backup/download`.
- [ ] **test:core passando:** Com MySQL rodando e migrações 0005 + 0006 aplicadas, `npm run test:core` conclui sem erros (inclui idempotência, concorrência, rollback, estoque negativo).

---

## Migrações

- [ ] **0005_idempotency_keys.sql:** Tabela `idempotency_keys` criada.
- [ ] **0006_idempotency_unique_command_key.sql:** UNIQUE(`commandName`, `key`) e índice em `createdAt` aplicados.
