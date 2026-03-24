# Plano de Teste Operacional — Nível Empresa

## Objetivo

Executar um roteiro de teste operacional ponta a ponta para validar que o ERP funciona no uso diário real, com volume pequeno porém suficiente para revelar falhas de fluxo, inconsistências visuais, quebras entre telas, estados inválidos e atritos de UX.

## Escopo

- **Incluído:** Cadastros base (clientes, produtos, fornecedores, vendedores), pedidos, conferência, estoque, cargas, baixa de carga, financeiro, dashboard, navegação, responsividade básica, cenários de erro.
- **Fora do escopo (não alterar):** Regras de pedidos, estoque, financeiro, cargas, pendências, autenticação, contratos de API, arquitetura backend, transações, idempotência.

## Premissas

1. Ambiente de teste com banco MySQL configurado (DATABASE_URL ou DB_*).
2. Ao menos um vendedor admin existente (ex.: `npm run seed:admin`).
3. Massa de teste pode ser criada via UI ou via script `server/scripts/seed-massa-teste.ts` (opcional).
4. Correções permitidas apenas: frontend, mensagens de erro, estados de tela, fluxo visual, integração entre telas, documentação, scripts de teste.

## Massa de teste

Massa mínima desejada para executar o roteiro:

| Entidade        | Quantidade mínima | Observação |
|-----------------|-------------------|------------|
| Clientes        | 5+                | Para pedidos variados |
| Produtos        | 5+                | Com estoque > 0 para venda |
| Vendedor(es)    | 1+                | Admin ou vendedor vinculado |
| Estoque         | Disponível        | Produtos com estoque para nota de entrada e pedidos |
| Cargas          | Criadas no teste  | 3 cargas de teste |
| Pedidos         | Criados no teste  | 10 pedidos (4 simples, 3 múltiplos itens, 2 com desconto/frete, 1 completo) |

Se faltar massa: usar cadastro via UI (Clientes, Produtos, Vendedores) ou executar o script de seed: `npx tsx server/scripts/seed-massa-teste.ts` (apenas em ambiente de desenvolvimento/teste). Pré-requisito: ao menos um vendedor (ex.: `npm run seed:admin`).

## Fluxos a validar

1. **Cadastros base:** Cliente (cadastrar, editar, buscar, histórico); Produto (cadastrar, editar, buscar, estoque); Fornecedor (cadastrar/editar produto com fornecedor); Vendedores (lista, cadastro, uso em pedido).
2. **Pedidos:** Criar 10 pedidos variados → salvar → aparecer em Pedidos e em Conferência quando aplicável; busca e filtro; detalhe e edição permitida.
3. **Conferência:** Pedidos aparecem; conferir; mudança de estado; feedback visual; tratamento de estado inválido.
4. **Estoque:** Nota de entrada (lançar, itens, impacto); ajuste (permitido e tentativa inválida); saída via pedido; pendências visíveis.
5. **Cargas:** Criar 3 cargas; adicionar pedidos; detalhe; resumo; baixa acessível.
6. **Baixa de carga:** Baixa parcial e total; pedido certo na carga certa; não duplicar baixa; mensagem clara; financeiro conforme regra; idempotência.
7. **Financeiro:** Contas a receber geradas; baixa visível; vencidas/abertas; filtros; histórico de caixa; boletos; minhas comissões.
8. **Dashboard:** Métricas úteis; pedidos do dia; cargas abertas; faturamento; alertas operacionais.
9. **Navegação e UX:** Menu; Command Palette (Ctrl+K); busca global; estados vazios; toasts; labels.
10. **Responsividade:** Desktop e largura menor; sidebar; tabelas; formulários sem quebra.
11. **Erros:** Estado inválido; estoque insuficiente; segunda baixa; filtro/busca sem resultado; campo obrigatório ausente; mensagem útil, sem stacktrace.

## Critérios de aprovação

- Fluxo pedido → conferência → carga → baixa → financeiro validado.
- Cadastros (clientes, produtos, vendedores) funcionais; busca e edição ok.
- Conferência e cargas/baixa sem quebra de estado nem duplicidade.
- Dashboard e alertas úteis (dados reais do backend).
- UX coerente: botões visíveis, mensagens claras, sem páginas “sem cara de pronta”.
- Gates: `npm run check`, `npm run build`, `npm run audit:code`, `npm run test:core` passando.
- Relatório final completo e confirmação de que regras de negócio não foram alteradas.

## Critérios de reprovação

- Quebra de fluxo operacional (ex.: pedido não aparece após criar; baixa não reflete).
- Inconsistência de estado (ex.: tela mostra um estado e banco outro).
- Erro visual grave ou tela quebrada.
- Duplicidade de lançamento financeiro ou quebra de idempotência.
- Gates falhando sem correção documentada.
- Alteração não autorizada de regras de negócio (pedidos, estoque, financeiro, cargas, auth, API, transações).

## Execução

- Seguir as fases 0 a 15 do roteiro de teste operacional.
- Registrar todas as falhas; corrigir no mesmo ciclo (dentro do escopo permitido); reexecutar teste afetado.
- Documentar massa criada, fluxos e telas testadas, problemas e correções em `docs/RELATORIO_TESTE_OPERACIONAL_EMPRESA.md`.
- Entregar checklist reproduzível em `docs/CHECKLIST_TESTE_OPERACIONAL.md`.
