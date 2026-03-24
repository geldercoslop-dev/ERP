# Assistente e IA conversacional do ERP

Este documento descreve o **Assistente operacional** (sugestões no dashboard) e a **IA conversacional** (chat para perguntas sobre os dados do sistema).

---

## Assistente operacional

### O que é

Serviço em `server/services/assistant/assistant.service.ts` que analisa dados do banco e gera **sugestões** em tom amigável e conversacional (como um amigo aconselhando). As mensagens têm várias variações para não ficar repetitivo.

### Função principal

- **`gerarSugestoesSistema()`** — Executa as verificações abaixo e retorna uma lista de `{ tipo, mensagem, prioridade, data }`.

### Verificações implementadas

| Verificação | Regra | Exemplo de mensagem |
|-------------|--------|----------------------|
| **Estoque parado** | Produto com saldo > 0 e sem movimentação (venda) há 30 dias | "esse produto tá parado há 30 dias. bora fazer uma promoção pra girar?" |
| **Pedido parado** | Pedido criado há mais de 20 dias sem alteração de status (GERADO ou PENDENTE_ESTOQUE) | "esse pedido tá parado faz um tempo. dá uma conferida nele." |
| **Financeiro desequilibrado** | Pagamentos hoje > recebimentos hoje | "hoje saiu mais dinheiro do que entrou. fica de olho no caixa." |
| **Contas a receber hoje** | Existe ao menos uma conta a receber com vencimento hoje e status PENDENTE | "tem contas pra receber hoje. vale dar uma checada." |
| **Movimento fraco** | Menos pedidos hoje que a média diária dos últimos 7 dias | "movimento de vendas hoje tá mais fraco que o normal." |
| **Data comercial** | Datas fixas (Carnaval, Dia das Mães, Dia dos Namorados, Black Friday, Natal) — aviso **15 dias antes** | "Carnaval tá chegando... talvez seja uma boa pensar numa promoção." |

### Onde aparece

- **Endpoint:** `assistant.list` (tRPC) — retorna lista de sugestões.
- **Dashboard (Home):** card **"Assistente do sistema"** com lista de sugestões (💡 + mensagem). O card só é exibido quando há sugestões.

### Como validar

1. Chamar `assistant.list` no cliente ou via API: deve retornar array de `{ tipo, mensagem, prioridade, data }`.
2. Na Home, com dados que disparem alguma verificação (ex.: conta a receber vencendo hoje, pedido parado há 20+ dias), o card "Assistente do sistema" deve aparecer com as mensagens.
3. Conferir o tom: amigável, conversacional, com variações (recarregar ou simular cenários para ver outras frases).

---

## IA conversacional

### O que é

Módulo em `server/services/ai/erp-ai.service.ts` que permite **perguntas em linguagem natural** sobre os dados do ERP. O sistema lê a pergunta, identifica a intenção, consulta o banco e monta uma resposta simples em português.

### Fluxo

1. **Ler a pergunta** — texto enviado pelo usuário.
2. **Identificar intenção** — por palavras-chave (normalização de acentos e case): vendas hoje, pedidos hoje, produto mais vendido, financeiro hoje, pedidos atrasados, estoque.
3. **Consultar banco** — uso de relatórios e queries existentes (ex.: vendas por período, produtos mais vendidos, contas a receber/pagar, pedidos em rota, produtos ativos).
4. **Montar resposta** — frase objetiva em português.

### Endpoint

- **`ai.ask`** — Input: `{ pergunta: string }`. Retorno: string com a resposta.

### Exemplos de perguntas e respostas

| Pergunta | Resposta (exemplo) |
|----------|--------------------|
| "como foram as vendas hoje?" | "Hoje tivemos 6 pedido(s) registrado(s), com total de R$ 1.200,00." |
| "quantos pedidos tivemos hoje?" | "Hoje tivemos 6 pedido(s) registrado(s)." |
| "qual produto mais vendeu?" | "O produto mais vendido hoje foi Coca Cola 2L, com 12 unidade(s)." |
| "como está o financeiro hoje?" | "Hoje entraram R$ 1.200,00 e saíram R$ 800,00." |
| "tem pedidos atrasados?" | "Existem 2 pedido(s) em rota no momento." |
| "como está o estoque?" | "Há 45 produto(s) ativo(s). 3 deles estão com estoque baixo (≤ 5 unidades)." |

### Página do assistente

- **Rota:** `/assistente`
- **Arquivo:** `client/src/pages/Assistente.tsx`
- **Interface:** tipo chat — campo de pergunta, botão enviar, lista de pares pergunta/resposta (você / sistema). Exemplos de perguntas são exibidos quando não há mensagens.

### Como validar

1. Acessar **/assistente**, fazer login se necessário.
2. Digitar uma das perguntas de exemplo (ex.: "quantos pedidos tivemos hoje?") e enviar.
3. Verificar se a resposta aparece em português e condiz com os dados do banco (pedidos hoje, financeiro hoje, etc.).
4. Testar "como está o estoque?" e "tem pedidos atrasados?" para conferir contagens.
5. Enviar uma frase que não seja reconhecida: deve retornar mensagem sugerindo exemplos de perguntas.

---

## Resumo

- **Assistente operacional:** sugestões automáticas no dashboard (estoque parado, pedido parado, financeiro desequilibrado, contas a receber hoje, movimento fraco, datas comerciais), com muitas variações de texto e tom amigável.
- **IA conversacional:** chat em `/assistente` com `ai.ask`; intenção identificada por palavras-chave; respostas em português com base em consultas ao banco (vendas, pedidos, produto mais vendido, financeiro, pedidos em rota, estoque).

Nenhum fluxo crítico (GERADO → CONFERIDO → EM_ROTA → ENTREGUE / CANCELADO), arquitetura, regras de negócio ou contratos de API foram alterados.
