# Checklist — Teste Operacional Empresa

Use este checklist para repetir o teste operacional ponta a ponta. Marque cada item após validar.

---

## Pré-requisitos

- [ ] Banco configurado (DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
- [ ] Ao menos um vendedor existente (`npm run seed:admin` se necessário)
- [ ] (Opcional) Massa de teste: `npx tsx server/scripts/seed-massa-teste.ts`

---

## FASE 1 — Cadastros base

### Clientes
- [ ] Cadastrar um cliente (nome + telefone)
- [ ] Editar cliente existente
- [ ] Localizar cliente na busca
- [ ] Abrir histórico do cliente
- [ ] Layout e ações claros

### Produtos
- [ ] Cadastrar produto
- [ ] Editar produto
- [ ] Localizar produto
- [ ] Verificar estoque inicial
- [ ] Campos obrigatórios validados

### Fornecedores
- [ ] Acessar Fornecedores (redireciona para Cadastros ou usa campo em Produto)
- [ ] Cadastrar/editar produto com fornecedor preenchido

### Vendedores
- [ ] Tela de Vendedores acessível (admin)
- [ ] Listar e, se aplicável, cadastrar/editar vendedor

---

## FASE 2 — Pedidos

- [ ] Criar 4 pedidos simples (1 item cada)
- [ ] Criar 3 pedidos com múltiplos itens
- [ ] Criar 2 pedidos com desconto e/ou frete
- [ ] Criar 1 pedido mais completo (vários itens + desconto/frete)
- [ ] Em cada um: cliente correto, itens corretos, total correto, pedido salvo
- [ ] Feedback visual claro após salvar
- [ ] Retorno para lista/fluxo correto
- [ ] Pedidos aparecem em Pedidos (lista)
- [ ] Pedidos aparecem em Conferência quando aplicável
- [ ] Busca e filtro de pedidos funcionam
- [ ] Abrir detalhe do pedido
- [ ] Editar o que for permitido

---

## FASE 3 — Conferência

- [ ] Pedidos aparecem em Conferência
- [ ] Conferir pedido válido
- [ ] Mudança de estado reflete visualmente
- [ ] Pedido conferido deixa de aparecer onde não deveria (conforme regra)
- [ ] Feedback da ação claro
- [ ] Tentativa de ação indevida (se possível) tratada com mensagem clara

---

## FASE 4 — Estoque

- [ ] Lançar nota de entrada com itens
- [ ] Confirmar impacto no estoque
- [ ] Testar ajuste permitido
- [ ] Tentativa de estoque inválido (ex.: negativo) gera erro operacional correto
- [ ] Saída via pedido impacta estoque conforme regra
- [ ] Saldo visual bate com o esperado
- [ ] Pendências de estoque aparecem quando devem e tela é clara

---

## FASE 5 — Cargas

- [ ] Criar carga 1 com 4 pedidos
- [ ] Criar carga 2 com 3 pedidos
- [ ] Criar carga 3 com 3 pedidos
- [ ] Lista de cargas visível e correta
- [ ] Detalhe da carga e resumo
- [ ] Pedidos aparecem na carga correta
- [ ] Ações principais claras; baixa acessível
- [ ] Carga sem pedidos / estado vazio tratado visualmente

---

## FASE 6 — Baixa de carga

- [ ] Pelo menos 1 pedido com baixa parcial
- [ ] Pelo menos 1 pedido com baixa total
- [ ] Pedido certo na carga certa
- [ ] Baixa atualiza estado corretamente
- [ ] Pedido entregue muda visualmente
- [ ] Pedido já entregue não aceita nova baixa (mensagem clara)
- [ ] Financeiro relacionado criado/atualizado conforme regra
- [ ] Sem duplicação de lançamento, conta, boleto/recebimento; idempotência ok

---

## FASE 7 — Financeiro

- [ ] Contas a receber geradas a partir de pedidos
- [ ] Baixa/registro financeiro visível
- [ ] Contas vencidas/abertas aparecem corretamente
- [ ] Filtros de contas funcionam
- [ ] Histórico de caixa funciona
- [ ] Boletos (se aplicável) aparecem corretamente
- [ ] Minhas comissões (se houver) não quebram
- [ ] Valores corretos; sem duplicidade; status visuais batem com estado real

---

## FASE 8 — Dashboard e alertas

- [ ] Métricas úteis na Home
- [ ] Pedidos do dia fazem sentido
- [ ] Cargas abertas fazem sentido
- [ ] Faturamento do dia faz sentido
- [ ] Alertas operacionais aparecem quando deveriam e são úteis
- [ ] Pedidos pendentes, cargas abertas, contas vencidas, pendência de estoque (se aplicável)

---

## FASE 9 — Navegação e UX

- [ ] Menu claro
- [ ] Command Palette (Ctrl+K) ajuda
- [ ] Busca global funciona
- [ ] Ações rápidas ajudam
- [ ] Botões principais visíveis; labels compreensíveis
- [ ] Estados vazios orientam o usuário
- [ ] Loading não confunde; toasts consistentes
- [ ] Ctrl+/, Ctrl+N, Esc para fechar modais
- [ ] Busca por cliente/pedido/produto

---

## FASE 10 — Responsividade básica

- [ ] Desktop padrão ok
- [ ] Largura menor (notebook) ok
- [ ] Sidebar, tabelas, headers, cards, formulários sem quebra
- [ ] Nada saindo da tela, ilegível ou sobrepondo

---

## FASE 11 — Erros e cenários inválidos

- [ ] Pedido em estado inválido: erro claro, tela não quebra
- [ ] Estoque insuficiente: mensagem útil
- [ ] Segunda baixa: tratada com mensagem clara
- [ ] Carga inválida / filtro sem resultado / busca sem resultado: tratamento correto
- [ ] Tela sem dados: estado vazio orienta
- [ ] Cadastro com campo obrigatório ausente: erro claro
- [ ] Sem stacktrace exposta ao usuário; sem silêncio operacional

---

## Gates finais

- [ ] `npm run check` — passou
- [ ] `npm run build` — passou
- [ ] `npm run audit:code` — passou
- [ ] `npm run test:core` — passou ou skip (sem banco)

---

## Critério de sucesso

- Fluxo pedido → conferência → carga → baixa → financeiro validado
- Erros importantes corrigidos
- Dashboard e alertas úteis
- UX coerente no uso real
- Gates passando
- Relatório final completo (e confirmação de que regras de negócio não foram alteradas)
