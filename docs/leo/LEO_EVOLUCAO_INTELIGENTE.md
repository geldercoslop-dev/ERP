# LEO — Evolução para Inteligência Operacional Avançada

Relatório das evoluções aplicadas ao ERP GRS e ao módulo LEO, sem alteração dos fluxos críticos (gerado → conferido → em_rota → entregue → cancelado).

---

## 1. Integração SuperFrete

- **Serviço:** `server/integrations/superfrete.service.ts`
- **Funções:**
  - `cotarFreteSuperFrete(params)` — cotação de frete (cache 5 min)
  - `gerarEtiquetaSuperFrete(shipmentId)` — geração de etiqueta de envio
  - `consultarRastreamentoSuperFrete(codigo)` — rastreamento por código
- **Variável de ambiente:** `SUPERFRETE_API_KEY`. Ausência retorna: *"integração SuperFrete não configurada"*.
- **Opção:** `SUPERFRETE_SANDBOX=1` para ambiente de testes.
- **Diagnóstico:** verificação incluída em `verificarConfiguracaoIntegracoes()` e no script `ERP_DIAGNOSTICO_LEO.bat`.

---

## 2. Cache de APIs

- **Módulo:** `server/cache/api-cache.ts`
- **TTL padrão:** 5 minutos.
- **Integrações com cache:** weather, currency, brasilapi, viacep, freight, superfrete (cotação).
- **Objetivo:** reduzir chamadas excessivas às APIs externas.

---

## 3. Comandos do LEO para frete

- **Novas intenções em** `server/services/ai/query-engine.ts`:
  - `cotar_frete_superfrete` — ex.: "qual o frete mais barato para este pedido"
  - `gerar_etiqueta_frete` — ex.: "gera etiqueta de envio"
  - `rastrear_entrega` — ex.: "rastrear entrega", "onde está a entrega"
- **Tratamento em** `server/services/ai/erp-ai.service.ts`: cotação SuperFrete, mensagem orientando etiqueta, rastreio (reutilizando lógica de rastrear_pedido).

---

## 4. Tarefas automáticas (scheduler)

- **Módulo:** `server/services/ai/leo-scheduler.ts`
- **Intervalo:** 10 minutos.
- **Tarefas:** verificar vendas do dia, estoque baixo, boletos vencidos, pedidos parados (GERADO/CONFERIDO há mais de 3 dias).
- **Início:** scheduler iniciado no bootstrap do servidor (`server/_core/index.ts`).

---

## 5. Notificações inteligentes (Telegram)

- **Módulo:** `server/services/ai/leo-notifier.ts`
- **Acionamento:** após cada ciclo do scheduler, se Telegram estiver configurado.
- **Alertas enviados:** estoque zerado, pedido grande (≥ R$ 3.000), queda de vendas, boletos vencidos, frete atrasado (EM_ROTA há mais de 7 dias), pedidos parados.

---

## 6. Insights de negócio

- **Módulo:** `server/services/ai/business-insights.ts`
- **Funções:** produto mais vendido (mês), queda de vendas, clientes que pararam de comprar (90 dias), produto sem giro (60 dias), tempo médio de entrega.
- **Uso:** exposto no painel LEO e no dashboard (`ai.dashboard`).

---

## 7. Painel de Inteligência (Leo Dashboard)

- **Página:** `client/src/pages/LeoDashboard.tsx`
- **Rota:** `/leo-dashboard`
- **Conteúdo:** status de entregas (em rota, entregues hoje), indicadores (tarefas do scheduler), insights de negócio, alertas, previsões (vendas e ruptura de estoque), eventos recentes (24h).
- **Menu:** item "Painel LEO" em SISTEMA.

---

## 8. Otimização de performance (índices)

- **Schema:** `drizzle/schema.ts`
- **Índices adicionados:**
  - `pedidos_status_updated_at_idx` em `pedidos(status, updatedAt)` — consultas por status e data de atualização (entregas, em rota, pedidos parados).
  - `produtos_ativo_estoque_idx` em `produtos(ativo, estoque)` — consultas de estoque baixo/zerado.

---

## 9. Log central do LEO

- **Tabela:** `leo_activity_log` em `drizzle/schema.ts`
- **Colunas:** tipo (pergunta | acao), usuario, pergunta, resposta, acao, dados, integracaoUsada, data.
- **Função:** `db.insertLeoActivityLog()` — chamada no router em `ai.ask` (pergunta/resposta) e `ai.confirmAction` (ação executada).

---

## 10. Monitoramento (/metrics)

- **Endpoint:** `GET /metrics` (já existia; payload estendido).
- **Novos campos:** `leo.askCount`, `leo.avgResponseTimeMs`, `apiCallsByIntegration` (contagem por integração em cache miss).
- **Funções:** `recordLeoAsk(durationMs)` e `recordApiCall(integration)` em `server/_core/metrics.ts`.

---

## 11. Diagnóstico de integrações

- **Arquivo:** `server/config/verificarIntegracoes.ts`
- **Inclusão:** verificação de `SUPERFRETE_API_KEY`; status exibido em `diagnostico.integracoes` (tRPC) e no script de diagnóstico.

---

## 12. Documentação atualizada

- **docs/ARQUITETURA.md** — seção "Integração SuperFrete".
- **docs/LEO_JARVIS.md** — seção "Integração SuperFrete" e comandos de frete/etiqueta/rastreio.
- **docs/LEO_INTEGRACOES_EXTERNAS.md** — tabela e seção "Integração SuperFrete", variável e exemplos de uso.

---

## 13. Resumo das novas capacidades do LEO

| Capacidade | Descrição |
|------------|-----------|
| Cotação SuperFrete | "Qual o frete mais barato para este pedido" — usa SuperFrete com cache 5 min |
| Etiqueta de envio | Orienta uso da tela de Cargas ou ID do envio |
| Rastrear entrega | Nova intenção para "rastrear entrega" / "onde está a entrega" |
| Scheduler 10 min | Vendas do dia, estoque baixo, boletos vencidos, pedidos parados |
| Notificações Telegram | Alertas automáticos (estoque zerado, pedido grande, queda vendas, boletos, frete atrasado, pedidos parados) |
| Business insights | Produto mais vendido, queda vendas, cliente parou de comprar, produto sem giro, tempo médio entrega |
| Painel LEO | Página com insights, alertas, previsões, indicadores e status de entregas |
| Log central | Tabela `leo_activity_log` para perguntas, respostas e ações |
| Métricas | Uso do LEO e chamadas de API em `/metrics` |

Fluxos críticos de pedido (**gerado**, **conferido**, **em_rota**, **entregue**, **cancelado**) não foram alterados.

---

## Aplicar alterações no banco

Para criar a tabela `leo_activity_log` e os novos índices (`pedidos_status_updated_at_idx`, `produtos_ativo_estoque_idx`), execute em desenvolvimento:

- `npm run db:push:dev`

Ou gere e aplique uma migração em produção:

- `npm run db:generate`
- `npm run db:migrate` (após backup)
