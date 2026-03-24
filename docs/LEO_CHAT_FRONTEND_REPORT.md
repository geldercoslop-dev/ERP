# Relatório — Interface do Assistente LEO no Frontend

**Objetivo:** Preparar a interface do assistente LEO no frontend do ERP e integrar com o endpoint de chat do LEO.

**Escopo:** Apenas frontend; nenhum arquivo em `server/*` foi alterado.

---

## 1. Serviço de comunicação com o LEO

**Arquivo:** `client/src/services/leoChatService.ts`

- **Função:** `sendMessageToLeo(message: string): Promise<LeoChatResponse>`
- **Requisição:** POST para `/api/leo/chat` (base: `VITE_API_URL` ou `window.location.origin`)
- **Body:** `{ message: "texto do usuário" }`
- **Retorno esperado:** `{ response: string, action?: string, data?: object, context?: object }`
- **Extras:** `normalizeLeoResponse(raw)` para normalizar respostas do backend (incluindo formato tRPC com `mensagem`). Suporte a `pendingConfirmation` quando o backend retornar confirmação pendente.

Quando o backend não expõe REST `/api/leo/chat`, o hook usa o procedimento tRPC `leo.ask` como fallback e normaliza a resposta com `normalizeLeoResponse`.

---

## 2. Componente de chat do LEO

**Arquivo:** `client/src/components/LeoChat.tsx`

- **Campo de texto:** input no rodapé do chat para digitar a mensagem
- **Botão enviar:** botão ao lado do input (ícone Send ou Loader quando loading)
- **Lista de mensagens:** área rolável com todas as mensagens (usuário e LEO)
- **Estado loading:** indicador “LEO está pensando...” e botão/input desabilitados
- **Estrutura:**
  - Janela de chat (Card com altura definida)
  - Mensagens do usuário à direita, com avatar User
  - Mensagens do LEO à esquerda, com avatar Bot
- **Sugestões iniciais:** botões clicáveis com frases de teste (ex.: “Como está o servidor?”, “Quem é o cliente João?”, etc.)
- **Dados estruturados:** quando o LEO retorna `data`, é exibida uma tabela simples (array de objetos ou objeto chave/valor) abaixo do texto da resposta

---

## 3. Hook de controle

**Arquivo:** `client/src/hooks/useLeoChat.ts`

- **Histórico:** estado `messages` (lista de `ChatMessage` com `id`, `role`, `content`, `leoResponse`, `timestamp`)
- **Enviar mensagem:** `sendMessage(text)` — adiciona mensagem do usuário, chama primeiro POST `/api/leo/chat`; em caso de 404 ou erro de rede, usa `trpc.leo.ask` e normaliza a resposta
- **Receber resposta:** a resposta é normalizada e adicionada como mensagem do LEO com `leoResponse` (response, action, data, context)
- **Loading:** estado `loading` ativado durante a requisição e desativado ao final (sucesso ou erro)
- **Extras:** `error` para mensagem de erro, `clearHistory()` para limpar o histórico

---

## 4. Layout no Dashboard

- **Local:** `client/src/pages/Dashboard.tsx`
- **Botão:** “Abrir Assistente LEO” (com ícone Bot), no topo do dashboard
- **Comportamento:** ao clicar, abre um **painel lateral (Sheet)** pela direita com o componente `LeoChat`
- **Fechar:** botão “Fechar” dentro do chat e o X do Sheet fecham o painel

---

## 5. Tratamento das respostas do backend

- **response:** exibido como conteúdo principal da mensagem do LEO
- **action:** exibido como texto auxiliar “Ação: …” quando presente
- **data:** quando é array de objetos, é renderizado em tabela (cabeçalho = chaves do primeiro item); quando é objeto, em tabela chave/valor
- Respostas vindas do tRPC com `mensagem` (string ou objeto com `response`) são normalizadas por `normalizeLeoResponse`

---

## 6. Mensagens iniciais de teste

Exemplos configurados como sugestões clicáveis no chat (e no Dashboard):

1. “Como está o servidor?”
2. “Quem é o cliente João?”
3. “Quais pedidos de hoje?”
4. “Tem cerveja em estoque?”

Podem ser alteradas via prop `initialSuggestions` do `LeoChat`.

---

## 7. Confirmações do relatório

| Item | Status |
|------|--------|
| **Componente criado** | Sim. `LeoChat.tsx` com janela de chat, mensagens usuário/LEO, campo de texto, botão enviar, loading e tabela para dados estruturados. |
| **Serviço funcionando** | Sim. `leoChatService.ts` com `sendMessageToLeo` e `normalizeLeoResponse`; o hook usa esse serviço e fallback para tRPC `leo.ask`. |
| **Endpoint /api/leo/chat** | O backend atual expõe o LEO via tRPC (`leo.ask`). O frontend tenta primeiro POST `/api/leo/chat`; se não existir (404) ou falhar a rede, usa `trpc.leo.ask` e normaliza a resposta. Assim o chat funciona com o backend atual e fica pronto para quando houver REST em `/api/leo/chat`. |
| **Chat pronto para uso no ERP** | Sim. Botão “Abrir Assistente LEO” no Dashboard abre o painel com o chat; histórico, loading e dados estruturados estão cobertos. |

---

## Arquivos criados/alterados (apenas frontend)

- `client/src/services/leoChatService.ts` — criado
- `client/src/hooks/useLeoChat.ts` — criado
- `client/src/components/LeoChat.tsx` — criado
- `client/src/pages/Dashboard.tsx` — alterado (botão + Sheet com LeoChat)
- `docs/LEO_CHAT_FRONTEND_REPORT.md` — criado (este relatório)

Nenhum arquivo em `server/*` foi modificado.
