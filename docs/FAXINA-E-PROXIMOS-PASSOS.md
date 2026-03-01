# Faxina (Fase 1) – Resumo e Próximos Passos

## O que foi feito na Faxina

### 1. Rotas corrigidas e adicionadas
- **`/meus-pedidos`** – Adicionada (era 404 ao clicar em "TODOS OS PEDIDOS" e "VER MEUS PEDIDOS").
- **`/cargas/:id`** – Adicionada para detalhes da carga (CargaDetalhes).
- **`/cargas/:id/baixa`** – Adicionada para tela de baixa (CargaBaixa).
- **`/pendencias`** – Adicionada e item "Pendências de Compra" incluído no menu (Operacional).

### 2. Botões "Voltar" que apontavam para rotas inexistentes
- **ContasPagar**, **ContasReceber**, **HistoricoCaixa**: "Voltar" ia para `/financeiro` (rota inexistente) → passou a ir para **`/`**.
- **ContasFixas**: "Voltar" ia para `/contas-pagar` → passou a ir para **`/`**.
- **GruposPrecificacao**, **Cores**: "Voltar" ia para `/cadastros` (rota inexistente) → passou a ir para **`/`**.

### 3. Login
- Tratamento de erro com **TRPCClientError** para exibir a mensagem do backend (ex.: "Usuário ou senha inválidos").
- Toast em vez de `alert()` já estava em uso; mantido e reforçado.

### 4. AppShell (Sidebar)
- **Link do wouter**: Removido `<a>` aninhado dentro de `<Link>` (evita `<a>` dentro de `<a>` e marcação inválida).
- Estilos aplicados diretamente no `<Link>` (com `className` e `block`).

### 5. Robustez e feedback visual
- **NovaVenda**: `cliente.telefone` e `cliente.telefoneRecado` com `?? ""` para evitar erro se vierem `undefined`; `catch` tipado com `error: unknown` e mensagem amigável.
- **MeusPedidos** e **Pendencias**: `onError` nas mutations de atualização de status para exibir toast de erro.

### 6. AdminRoute
- Em vez de retornar `null` durante o carregamento, exibe "Carregando..." dentro do Shell para evitar tela em branco.

### 7. Testes (Fase 2 – básico)
- **`server/fluxo-principal.test.ts`**: testes para:
  - `auth.login` com credenciais válidas/inválidas
  - `auth.me` com contexto autenticado
  - `clientes.list` e `pedidos.list` (vendedor)
  - `vendedores.list` (admin)

Execute: `pnpm test`

---

## Próximos passos sugeridos (ordem de implementação)

### Curto prazo (estabilidade e UX)
1. **Consistência visual** – Padronizar headers, espaçamento e botões "Voltar" em todas as telas (ex.: mesmo estilo do AppShell/Home).
2. **Busca global** – Habilitar e conectar o campo "Buscar no sistema" do AppShell (hoje desabilitado) a um componente de busca (ex.: GlobalSearch) com navegação para clientes, pedidos, produtos.
3. **NovaVenda – edição** – Suportar `?edit=ID` na URL para abrir um pedido em edição (hoje o link existe em MeusPedidos mas a tela não carrega o pedido).

### Médio prazo (real-time e múltiplas ações)
4. **Botão Salvar com múltiplas ações** – Ao salvar pedido:
   - Atualizar status
   - Gerar pendência de compra (se aplicável)
   - Invalidar listas (já feito)
   - Opcional: notificação em tempo real para o admin (polling ou WebSocket).
5. **Estado global (Context API ou Zustand)** – Centralizar dados que precisam ser compartilhados entre telas (ex.: lista de pedidos atualizada, notificações) para que o Admin veja mudanças feitas pelo Vendedor sem recarregar.
6. **Funções assíncronas** – Garantir que todas as ações críticas (Salvar pedido, Cadastrar cliente, Atualizar status) usem `async/await` com `try/catch` e feedback (toast/snackbar). Revisar telas que ainda não seguem esse padrão.

### Longo prazo (funcionalidades restantes)
7. **Rotas opcionais** – Se for necessário, adicionar:
   - `/financeiro` (hub) → Financeiro.tsx
   - `/contas-pagar`, `/contas-receber` (se forem usadas no menu ou fluxo)
   - `/cadastros` (hub) → Cadastros.tsx
   Assim, os "Voltar" podem voltar para esses hubs em vez de `/`.
8. **Notificações em tempo real** – WebSocket ou polling para atualizar lista de pedidos/pendências no admin quando um vendedor salva.
9. **Testes E2E** – Com Playwright ou Cypress para o fluxo: Login → Cadastro Cliente → Nova Venda → Salvar (já há testes de API em `server/fluxo-principal.test.ts`).

---

## Checklist pós-faxina

- [x] Rotas quebradas corrigidas
- [x] Botões "Voltar" sem 404
- [x] Login com tratamento de erro e toast
- [x] Sidebar com Link correto (sem `<a>` aninhado)
- [x] Try/catch e feedback em NovaVenda, MeusPedidos, Pendencias
- [x] Testes automatizados básicos (fluxo principal no backend)
- [ ] Layout consistente entre telas (refatoração visual)
- [ ] Busca global ativa
- [ ] NovaVenda ?edit= implementado
- [ ] Estado global + real-time (Context/Zustand + invalidação/notificação)
