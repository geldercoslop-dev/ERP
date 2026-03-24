# Teste operacional – Guia rápido

Este documento descreve como preparar e executar o teste operacional real do ERP: simulação de fluxos, verificação do dashboard e validação dos fluxos críticos.

---

## 1. Pré-requisitos

- **Banco:** MySQL configurado em `.env` (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME). O sistema detecta automaticamente `vendas_app` ou `grs`.
- **Dados mínimos:** ao menos 1 vendedor, clientes e produtos cadastrados.
- **Build:** `npm run build` e `npm run check` sem erros.

---

## 2. Como rodar a simulação

A simulação exercita o fluxo completo: **pedidos → conferência → cargas → baixa (parcial e total)**.

### Comando

Na raiz do projeto:

```bash
npm run simular-operacao
```

Ou diretamente:

```bash
npx tsx scripts/simular-operacao.ts
```

### O que o script faz

1. **10 pedidos** – Cria pedidos com status `GERADO`, usando o primeiro vendedor, clientes e produtos existentes.
2. **Conferência** – Marca todos os 10 pedidos como `CONFERIDO` (com registro em audit usando `traceId`).
3. **3 cargas** – Cria 3 cargas (4 + 3 + 3 pedidos), depois chama `fecharCarga` em cada uma (status `EM_ROTA`).
4. **Baixa** – Faz baixa parcial e total nos pedidos das cargas; em seguida tenta uma segunda baixa no mesmo pedido (comportamento esperado: erro de “já baixado”).

### Saída esperada

- Mensagens de progresso no console (pedidos criados, conferência, cargas, baixas).
- Ao final, indicação de que a simulação terminou.
- Se houver erro, a mensagem indica em qual etapa falhou.

### Em caso de falha

- Verifique `.env` e conectividade com o banco.
- Confirme que existem vendedor, clientes e produtos.
- Consulte os logs do backend e a tabela `audit_log` (por `traceId` da simulação) para rastrear a etapa que falhou.

---

## 3. Como verificar o dashboard

Após a simulação (ou em uso normal), o dashboard na **Home** deve refletir os dados do dia e do resumo operacional.

### Métricas exibidas

- **Pedidos hoje** – Quantidade de pedidos criados na data atual.
- **Cargas abertas** – Cargas com status `ABERTA` ou `EM_ROTA`.
- **Entregas hoje** – Pedidos com status `ENTREGUE` e `updatedAt` na data atual.
- **Pendências** – Quantidade de pendências abertas.
- **Recebido hoje** – Soma dos valores de contas a receber com status `RECEBIDA` e data de recebimento hoje.

Além disso, continuam visíveis: aguardando conferência, conferidos para carga, em rota, faturamento a receber, pendências e (para admin) a pagar.

### Como validar

1. Acesse a aplicação e faça login.
2. Abra a **Home** (dashboard).
3. Confira se os números batem com o esperado (ex.: após a simulação, “Pedidos hoje” deve incluir os 10 pedidos criados; “Cargas abertas” ou “Em rota” as 3 cargas).
4. Use os cards para navegar para Conferência, Cargas, Contas a receber etc. e cruzar com as listagens.

---

## 4. Como validar os fluxos

O fluxo crítico de status de pedido **não deve ser alterado**:

- **GERADO** → **CONFERIDO** → **EM_ROTA** → **ENTREGUE**
- **CANCELADO** à parte

### Conferência

- Tela **Conferência de pedidos**: pedidos em `GERADO` aparecem para conferir.
- Ao conferir, o status passa a `CONFERIDO` e é registrado em `audit_log` (ação de conferência, com `traceId` quando disponível).

### Cargas

- Tela **Cargas**: pedidos `CONFERIDO` podem ser agrupados em cargas.
- Ao criar carga: registro em `audit_log` (criação de carga, `traceId`).
- Ao fechar carga (enviar para rota): status da carga para `EM_ROTA` e registro em `audit_log` (evento “envio_para_carga”, `traceId`).

### Baixa de entrega

- Tela **Carga (detalhes)** / **Baixa**: é possível dar baixa parcial ou total nos itens da carga.
- A baixa atualiza o pedido (e status quando for baixa total) e é registrada na camada de banco/audit conforme implementado.

### Rastreio

- Use a **Auditoria** (se disponível) ou consultas diretas à tabela `audit_log` filtrando por `entity` (`pedido`, `carga`), `action` e `traceId` para validar criação de pedido, conferência, envio para carga e baixa financeira.

---

## 5. Relatórios (backend)

Os relatórios estão disponíveis apenas via **backend** (tRPC), sem telas específicas ainda:

| Procedimento tRPC | Descrição |
|-------------------|-----------|
| `reports.vendasPeriodo` | Vendas por período (dataInicio, dataFim); agrupado por dia; total de pedidos e valor. Respeita vendedor quando não for admin. |
| `reports.produtosMaisVendidos` | Produtos mais vendidos no período (quantidade); parâmetros: dataInicio, dataFim, limit opcional. |
| `reports.clientesAtivos` | Clientes com pedidos no período (quantidade de pedidos e valor total); opcional limit e filtro por vendedor. |
| `reports.cargasRealizadas` | Cargas criadas no período (com quantidade de pedidos por carga). |

Uso: chamar esses procedimentos a partir do cliente (Relatórios ou outra tela futura) passando intervalos de data.

---

## 6. Checklist rápido

- [ ] Banco configurado e acessível.
- [ ] `npm run simular-operacao` executa sem erro.
- [ ] Dashboard mostra pedidos hoje, cargas abertas, entregas hoje, pendências e recebido hoje.
- [ ] Fluxo GERADO → CONFERIDO → EM_ROTA → ENTREGUE preservado.
- [ ] Audit log registra criação de pedido, conferência, criação/fechamento de carga e baixa (com traceId quando aplicável).
- [ ] Relatórios (vendas-periodo, produtos-mais-vendidos, clientes-ativos, cargas-realizadas) respondem corretamente no backend.

Com isso, o sistema está preparado para teste operacional real.
