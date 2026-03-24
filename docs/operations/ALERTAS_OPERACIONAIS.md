# Alertas operacionais

Sistema de alertas que sinaliza situações que exigem ação no fluxo operacional (pedidos, cargas, entregas, financeiro e estoque).

---

## Como funciona

- O **motor de alertas** está em `server/services/alerts/alerts.service.ts`, na função `gerarAlertasOperacionais(vendedorId?)`.
- O backend expõe o procedimento tRPC **`alerts.list`**, que chama o motor e retorna uma lista de alertas.
- Na **Home** (dashboard), a seção **"Alertas operacionais"** exibe essa lista quando há itens (cada linha com ⚠ e a mensagem; clique leva à tela relacionada).
- Para **vendedor** logado, só são considerados pedidos/cargas do próprio vendedor; **admin** vê todos os alertas. Produtos em estoque baixo são globais.

---

## Alertas implementados

| Tipo | Descrição | Regra | Entidade relacionada |
|------|-----------|--------|----------------------|
| **pedido_parado** | Pedido gerado há mais de 24h sem conferência | Status `GERADO` ou `PENDENTE_ESTOQUE` e `createdAt` &lt; agora − 24h | Pedido |
| **carga_atrasada** | Carga aberta há mais de 12h sem envio para rota | Carga com status `ABERTA` e `createdAt` &lt; agora − 12h | Carga |
| **entrega_pendente** | Pedido em rota há mais de 48h | Status `EM_ROTA` e `updatedAt` &lt; agora − 48h | Pedido |
| **financeiro_pendente** | Pedido entregue mas ainda com valor a receber | Pedido `ENTREGUE` e existe conta a receber `PENDENTE` com mesmo `pedidoNumero` | Pedido |
| **estoque_baixo** | Produto com estoque no ou abaixo do mínimo | Produto ativo com `estoque` ≤ 5 (limite fixo; schema não possui campo estoque mínimo) | Produto |

---

## Como validar

1. **Backend**
   - Com usuário logado, chamar `alerts.list` (sem input). Resposta: array de `{ tipo, mensagem, entidade: { tipo, id, numero? }, data }`.

2. **Dashboard**
   - Acessar a Home. Se existir algum alerta, a seção "Alertas operacionais" aparece com lista simples (⚠ + mensagem). Clicar no item deve levar à tela correspondente (conferência, cargas ou produtos).

3. **Cenários de teste**
   - **Pedido parado:** criar um pedido e deixá-lo em status GERADO por mais de 24h (ou em ambiente de teste ajustar o relógio/banco). Deve surgir alerta "Pedido #N gerado há mais de 24h sem conferência".
   - **Carga atrasada:** criar uma carga e não fechá-la (não enviar para rota). Após 12h deve surgir "Carga #N aberta há mais de 12h sem envio para rota".
   - **Entrega pendente:** ter um pedido EM_ROTA com `updatedAt` há mais de 48h. Deve surgir "Pedido #N em rota há mais de 48h".
   - **Financeiro pendente:** ter pedido ENTREGUE e ao menos uma conta a receber PENDENTE com o mesmo número do pedido. Deve surgir "Pedido #N entregue mas ainda com valor a receber".
   - **Estoque baixo:** ter produto ativo com estoque ≤ 5. Deve surgir alerta com descrição do produto e quantidade.

4. **Vendedor vs admin**
   - Logado como vendedor: apenas alertas de pedidos/cargas do próprio vendedor (e todos de estoque baixo).
   - Logado como admin: todos os alertas de pedidos e cargas, além de estoque baixo.

---

## Observações

- Os prazos (24h, 12h, 48h) e o limite de estoque (5) estão definidos no serviço. Ajustes futuros podem virar configuração (ex.: tabela `configuracoes` ou constantes por ambiente).
- O fluxo crítico de status (GERADO → CONFERIDO → EM_ROTA → ENTREGUE / CANCELADO) **não é alterado**; os alertas apenas leem o estado atual e sinalizam atrasos ou pendências.
