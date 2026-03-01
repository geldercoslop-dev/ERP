# React 100% funcional — Checklist e próximos passos

## O que foi feito para fechar rotas, comunicação e botões

### 1. Rotas

- **Menu ↔ App**: Todo item do `menuConfig` tem rota correspondente em `App.tsx`.
- **Rotas dinâmicas**: `/cargas/:id`, `/cargas/:id/baixa` para CargaDetalhes e CargaBaixa.
- **Rotas adicionadas** (para nenhum link levar a 404):
  - `/financeiro` → hub Financeiro (admin)
  - `/financeiro/historico` → HistoricoCaixa (admin)
  - `/contas-receber` → ContasReceber (admin)
  - `/contas-pagar` → ContasPagar (admin)
  - `/cadastros` → hub Cadastros (admin)
  - `/grupos-precificacao` → GruposPrecificacao (admin)
  - `/cores` → Cores (admin)
  - `/configuracoes-banco` → ConfiguracoesBanco (admin)

### 2. Botões “Voltar” e links

- **Financeiro**: link “Boletos” aponta para `/boletos` (não mais `/financeiro/boletos`).
- **ContasPagar, ContasReceber, HistoricoCaixa**: “Voltar” → `/financeiro`.
- **ContasFixas**: “Voltar” → `/contas-pagar`.
- **Cores, GruposPrecificacao, ConfiguracoesBanco**: “Voltar” → `/cadastros`.

### 3. Menu (sidebar)

- **Financeiro (admin)**: item “Financeiro (admin)” com href `/financeiro`.
- **Cadastros**: item “Cadastros” com href `/cadastros` no grupo Configurações.

### 4. Comunicação entre telas (invalidação)

- **NovaVenda (Salvar pedido)**:
  - `utils.clientes.list.invalidate()`
  - `utils.pedidos.list.invalidate()`
  - `utils.pendencias.list.invalidate()`
- **Clientes (criar/editar)**:
  - `utils.clientes.list.invalidate()` (via onSettled das mutations).
- **MeusPedidos / Pendencias (atualizar status)**:
  - `utils.pedidos.list.invalidate()` / `utils.pendencias.list.invalidate()` (via onSuccess).

Assim, ao salvar pedido, criar cliente ou alterar status, as listas nas outras telas atualizam ao navegar ou ao refocus.

---

## Checklist “React 100%” (rotas, linguagem entre telas, botões)

| Item | Status |
|------|--------|
| Todo link do menu leva a uma rota existente | ✅ |
| Todo `setLocation(...)` no código aponta para rota existente | ✅ |
| Rotas dinâmicas (/cargas/:id, /cargas/:id/baixa) | ✅ |
| Hubs Financeiro e Cadastros acessíveis e com “Voltar” coerente | ✅ |
| Salvar pedido invalida listas (pedidos, clientes, pendencias) | ✅ |
| Mutations críticas com try/catch e feedback (toast) | ✅ |
| Login com tratamento de erro e redirecionamento | ✅ |
| Busca global ativa no AppShell | ✅ |
| NovaVenda com ?edit=ID (carregar pedido) | ✅ |
| Layout padronizado (PageHeader + PAGE_* nas telas principais) | ✅ |

---

## Próximos passos (após React 100%)

Ordem sugerida para seguir com o resto do sistema:

1. **Financeiro**  
   Regras de negócio, integrações e fluxos em Contas a Pagar, Contas a Receber, Boletos, Caixa, Plano de Contas.

2. **Precificação**  
   Grupos de precificação, regras de margem, promoções já existentes no menu.

3. **Relatórios**  
   Conteúdo e filtros das telas de relatórios (admin).

4. **Real-time opcional**  
   Se quiser que a tela do admin atualize sem recarregar quando o vendedor salva: polling (refetchInterval) ou WebSocket; hoje a invalidação já garante atualização ao mudar de tela ou ao refocus.

5. **Testes E2E**  
   Fluxos principais (login → cliente → venda → salvar) com Playwright/Cypress.

Com isso, a parte de **funcionamento (rotas, comunicação entre telas e botões)** fica fechada; em seguida você pode focar em financeiro, precificação e demais módulos.
