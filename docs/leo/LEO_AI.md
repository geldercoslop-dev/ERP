# LEO — Assistente da Empresa

O LEO é o copiloto inteligente do ERP. Ele responde perguntas em linguagem natural sobre os dados do sistema e pode gerar relatórios em PDF.

---

## Como funciona

1. **Pergunta** — O usuário digita uma pergunta ou comando no chat.
2. **Normalização** — O texto é normalizado (minúsculas, remoção de acentos).
3. **Identificação da intenção** — O motor de perguntas (`query-engine.ts`) identifica a intenção e extrai entidades (número do pedido, nome do cliente, nome do produto, data, período, tipo de relatório).
4. **Consulta no banco** — O serviço LEO (`erp-ai.service.ts`) consulta apenas dados do ERP (pedidos, clientes, produtos, estoque, financeiro, cargas, vendedores). **Não acessa sistema operacional nem arquivos externos.**
5. **Resposta amigável** — A resposta é montada com frases variadas do LEO (ex.: "Fala! Já dei uma olhada aqui...", "Deixa comigo, estou vendo isso...") e os dados encontrados.

---

## Tipos de perguntas suportadas

| Intenção | Exemplos |
|----------|----------|
| **pedido_por_numero** | "qual o pedido 123?", "dados do pedido #456" |
| **pedido_por_cliente** | "pedidos do cliente João", "quantos pedidos da Maria?" |
| **valor_pedido** | "qual o valor do pedido 100?" |
| **vendas_hoje** | "como foram as vendas hoje?", "vendas do dia" |
| **vendas_mes** | "vendas do mês", "faturamento do mês" |
| **produto_mais_vendido** | "qual produto mais vendeu?", "mais vendido hoje" |
| **produtos_vendidos_periodo** | "produtos vendidos", "ranking de produtos" |
| **estoque_produto** | "estoque do produto X", "quantidade em estoque do Y" |
| **lista_estoque** | "como está o estoque?", "estoque geral" |
| **estoque_baixo** | "produtos com estoque baixo" |
| **financeiro_hoje** | "como está o financeiro hoje?", "entrou quanto, saiu quanto" |
| **pagamentos_hoje** | "quanto saiu hoje em pagamentos?" |
| **recebimentos_hoje** | "quanto entrou hoje?" |
| **contas_receber** | "contas a receber", "total a receber" |
| **contas_pagar** | "contas a pagar", "total a pagar" |
| **vendedores** | "lista de vendedores", "quantos vendedores?" |
| **clientes** | "quantos clientes?", "lista de clientes" |
| **clientes_ativos** / **ranking_clientes** | "clientes que mais compraram", "ranking de clientes" |
| **pedidos_em_rota** / **pedidos_atrasados** | "pedidos em rota", "tem pedidos atrasados?" |
| **ranking_produtos** | "top produtos", "produtos mais vendidos" |
| **Relatório PDF** | "gera estoque em PDF", "me manda relatório de vendas", "exporta lista de clientes", "exporta produtos em PDF" |

---

## Geração de relatórios em PDF

O LEO reconhece comandos como:

- **"gera estoque em PDF"** / **"relatório estoque"** — Relatório de estoque (produtos ativos e quantidades).
- **"me manda relatório de vendas"** / **"vendas em PDF"** — Relatório de vendas (pedidos do mês).
- **"exporta lista de clientes"** / **"clientes em PDF"** — Lista de clientes (nome, telefone, cidade).
- **"exporta lista de produtos"** / **"produtos em PDF"** — Lista de produtos (descrição, estoque, valor).

Após gerar, a resposta do LEO inclui um botão **"Baixar PDF"** na própria mensagem do chat. O PDF é gerado no backend (`server/services/reports/pdf.service.ts`) e enviado em base64 (dataUri) na resposta.

---

## Exemplos de uso

- *"Quantos pedidos tivemos hoje?"* → LEO responde com o número de pedidos e o total em R$.
- *"Qual o pedido 42?"* → Dados do pedido #42 (cliente, status, total, itens).
- *"Vendas do mês?"* → Total de pedidos e valor no mês atual.
- *"Qual produto mais vendeu?"* → Nome do produto e quantidade (período: hoje por padrão).
- *"Como está o financeiro hoje?"* → Valores que entraram e saíram hoje.
- *"Tem pedidos em rota?"* → Quantidade de pedidos com status EM_ROTA.
- *"Gera estoque em PDF"* → Mensagem de confirmação + botão para baixar o PDF.

---

## Acesso aos dados

O LEO **só** consulta e gera relatórios a partir de:

- Pedidos  
- Clientes  
- Produtos e estoque  
- Financeiro (contas a receber, contas a pagar)  
- Cargas  
- Vendedores  
- Relatórios (estoque, vendas, clientes, produtos em PDF)

Ele **não** acessa sistema operacional, sistema de arquivos nem recursos externos ao ERP. Os fluxos críticos (GERADO → CONFERIDO → EM_ROTA → ENTREGUE / CANCELADO) e as regras de negócio não são alterados pelo LEO; ele apenas lê e agrega dados.

---

## Como validar

1. Acesse **/assistente** (menu: **LEO — Assistente da Empresa**).
2. Envie perguntas de cada tipo (ex.: pedido por número, vendas hoje, estoque, financeiro, relatório PDF).
3. Confira se as respostas batem com os dados do sistema e se o tom é amigável (variações de "Fala!", "Deixa comigo...", etc.).
4. Para relatórios: peça "gera estoque em PDF" (ou vendas/clientes/produtos) e use o botão "Baixar PDF" na resposta para baixar o arquivo.
