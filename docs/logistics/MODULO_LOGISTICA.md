# Módulo de Logística de Cargas

Este documento descreve o módulo de logística de cargas do ERP: planejamento de rotas, roteiro de entrega, mapa e baixa.

## Visão geral

- **Fluxos de pedido preservados:** gerado → conferido → em_rota → entregue / cancelado. O módulo não altera essas regras.
- **Carga:** agrupa pedidos conferidos para uma rota (cidade + data). Status da carga: ABERTA (planejada), EM_ROTA (liberada), ENTREGUE (finalizada).
- **Roteiro:** ordem de entrega dos pedidos na carga; editável (reordenação manual e horário previsto).
- **Rota sugerida:** opcional, por bairro/cidade ou geocoding (OpenRouteService) para sugerir ordem; o usuário pode aceitar ou ignorar.

## Estrutura no servidor

- `server/modules/logistica/`
  - `carga.service.ts` — listar/criar/atualizar cargas e ordem de entrega.
  - `roteiro.service.ts` — dados do roteiro e geração de PDF (roteiro de entrega).
  - `rota-sugerida.service.ts` — sugestão automática de ordem (fallback por bairro/cidade; opcional OpenRouteService).
  - `mapa-rota.service.ts` — pontos da carga para exibição no mapa.
  - `logistica-history.service.ts` — histórico de rotas e consultas (última carga por cidade, etc.).

## Tabelas

- **cargas** (existente): id, numero, cidadeRota, dataEntrega, status (ABERTA | EM_ROTA | ENTREGUE), createdAt, updatedAt.
- **pedidos_carga** (existente, estendida): id, cargaId, pedidoId, entregue, dataBaixa, **ordemEntrega**, **horarioPrevisto**, **horarioReal**, **bairro**, **cidade**, **observacao**, createdAt.
- **historico_rotas** (nova): id, cidade, bairro, data, cargaId, ordemEntrega, tempoEntrega, createdAt.

## Telas e rotas

| Rota | Descrição |
|------|-----------|
| `/logistica` | Hub: links para gerar carga, roteiro, mapa, baixa, histórico, relatório. |
| `/logistica/carga` | Gerar carga: cidade, data, seleção de pedidos; número gerado automaticamente. |
| `/cargas` | Lista de cargas; ao clicar abre detalhes. |
| `/cargas/:id` | Detalhes da carga: pedidos na ordem de entrega, subir/descer, horário previsto, Sugerir rota, Roteiro PDF, Romaneio, Mapa, Liberar / Dar baixa. |
| `/logistica/mapa` | Lista de cargas para escolher. |
| `/logistica/mapa/:id` | Mapa (OpenStreetMap/Leaflet) com endereços e linha da rota. |
| `/cargas/:id/baixa` | Baixa de carga: marcar pedidos como entregues (fluxo financeiro + comissão). |
| `/logistica/historico` | Histórico de rotas (cidade, bairro, carga, ordem). |
| `/logistica/relatorio-viagem` | Relatório de viagem: número carga, data, cidade, lista de pedidos, rota executada. |

## Funcionalidades

1. **Criar carga:** cidade, data de entrega; número automático; seleção de pedidos (somente CONFERIDO).
2. **Adicionar/remover pedidos:** apenas carga ABERTA; ao incluir, pedido vai para EM_ROTA; ao remover, volta para CONFERIDO.
3. **Reordenação:** botões subir/descer na lista; atualiza `ordem_entrega`.
4. **Horário previsto:** campo editável por pedido na lista; salvo em `horario_previsto`.
5. **Sugerir rota:** ordenação por bairro/cidade ou, com OPENROUTE_API_KEY, geocoding + nearest-neighbor; usuário aplica ou não.
6. **Roteiro de entrega (PDF):** cabeçalho cidade + data; tabela ordem, pedido, cliente, valor, bairro, cidade, vendedor, horário previsto, observação; imprimir/PDF.
7. **Mapa:** pontos da carga e polyline da rota (Leaflet + OpenStreetMap).
8. **Baixa:** por pedido na tela de baixa; ao marcar entregue, grava `horario_real` e data; quando todos entregues, carga passa a ENTREGUE.
9. **Comissão:** gerada na baixa do pedido (fluxo existente).
10. **Histórico:** ao finalizar a carga (todos entregues), registros em `historico_rotas` (cidade, bairro, ordem, tempo).

## LEO (Assistente)

Perguntas suportadas:

- "Qual foi a última carga para [cidade]?"
- "Qual rota fizemos ontem?"
- "Qual cidade entregamos mais?"
- "Qual vendedor teve mais entregas?"

## Variáveis de ambiente

- `OPENROUTE_API_KEY` (opcional): para geocoding na sugestão de rota. Sem ela, usa apenas ordenação por bairro/cidade.

## Migração

Executar o SQL em `drizzle/0016_logistica_pedidos_historico.sql` para adicionar colunas em `pedidos_carga` e criar a tabela `historico_rotas`.
