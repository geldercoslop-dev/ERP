# Relatório — Teste real core (services / modules)

**Data:** 2026-03-20  
**Comando:** `pnpm vitest run server/services/core-business-real.test.ts`  
**Typecheck:** `pnpm exec tsc -p tsconfig.server.json --noEmit`

## Escopo

- Arquivo: `server/services/core-business-real.test.ts`
- Serviços exercitados: `orders.service` (`createPedidoSafe`, `updatePedidoStatus`, `deletePedido`), `finance.service` (`baixarBoletoParcial`), `inventory.service`, `clientes.service`
- **Correção aplicada em produção:** `createPedidoSafe` agora reconhece `ER_DUP_ENTRY` quando o Drizzle envolve o erro em `cause` (antes podia propagar exceção em vez de retornar `success: false`).

## ✔ consistente

| Área | Evidência |
|------|-----------|
| **Concorrência + idempotência** | 10 chamadas paralelas com o mesmo payload → 1 `success: true`, 9 `success: false`; sem múltiplos pedidos duplicados pela mesma chave. |
| **Estoque** | 10 pedidos distintos (10 clientes) em paralelo → estoque final ≥ 0 e batendo com o esperado após reset controlado. |
| **Financeiro (boleto)** | 10 `baixarBoletoParcial` em paralelo com valor total → `valorAberto === 0`, status `PAGO` (estado final coerente). |
| **Consistência CRUD** | Criar → atualizar status → excluir → `getPedidoById` null. |
| **Edge** | Pedido sem itens lança erro; status inválido rejeita com `validateStatus`. |
| **Idempotência DB** | Chave duplicada tratada sem sucesso falso (retorno explícito `success: false`). |

## ❌ quebrou

- Nenhum com a suíte atual após correção de idempotência e telefones únicos nos testes.

## ⚠ risco

1. **`baixarBoletoParcial` (10× paralelo)**  
   Todas as chamadas retornam `success: true`; o boleto termina `PAGO` com `valorAberto` 0, mas **`atualizarCaixaMensal` pode ser executada várias vezes** para o mesmo pagamento lógico. O teste valida **estado do boleto**, não unicidade de crédito em caixa. Recomenda-se: rejeitar baixa se `status === PAGO` ou `valorAberto <= 0`, ou idempotência por `boletoId`+valor.

2. **`baixarPedidoDireto` / baixa duplicada de pedido**  
   Não coberto nesta suíte; chamadas concorrentes na mesma baixa podem duplicar lançamentos — revisar com `FOR UPDATE` + regra de “já entregue”.

3. **`safe-payment.module` / SQL legado**  
   Uso de colunas como `pedido_id` em SQL cru pode divergir do schema Drizzle atual; não foi exercitado aqui.

4. **Ambiente**  
   Testes usam **MySQL real** (`DATABASE_URL`). Sem banco, `beforeAll` marca `dbAvailable = false` e os testes encerram sem provar nada.

## Execução

```bash
# Opcional: desligar o suite
RUN_REAL_CORE_TESTS=0 pnpm vitest run server/services/core-business-real.test.ts

pnpm vitest run server/services/core-business-real.test.ts
pnpm exec tsc -p tsconfig.server.json --noEmit
```

## Tenant de teste

Padrão: `TEST_CORE_TENANT_ID=99001` (isolado; `afterAll` remove dados do tenant).
