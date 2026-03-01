# Teste rápido (smoke test)

Checklist passo a passo para validar que o sistema está saudável após mudanças ou deploy. Use em desenvolvimento e antes de considerar um deploy estável.

---

## Pré-requisitos

- [ ] MySQL rodando (XAMPP ou outro; porta 3306).
- [ ] Variáveis de ambiente configuradas (`.env` ou `.env.development` com DATABASE_URL ou DB_*).
- [ ] Na pasta do projeto: `npm install` já foi executado.

---

## 1. Subir o sistema

- [ ] Rodar `npm run dev` (ou `npm run start` em produção).
- [ ] Abrir no navegador a URL que aparecer no terminal (ex.: `http://localhost:3003`).
- [ ] A tela de login deve abrir sem erro de conexão.

---

## 2. Healthcheck

- [ ] Abrir em outra aba: `http://localhost:3003/api/health` (ajuste a porta se for outra).
- [ ] A resposta deve ter:
  - `status`: "ok" ou "degraded".
  - `db.status`: "ok".
  - `schemaMatch`: true (versão do banco = versão esperada pelo código).
- [ ] Se `schemaMatch` for false ou `db.status` for "error", corrigir antes de continuar (ver BASE_DE_DADOS.md e RECUPERACAO_SISTEMA.md).

---

## 3. Login (admin)

- [ ] Na tela de login, entrar com usuário **admin** (o que foi criado pelo seed ou já existia).
- [ ] Após enviar, deve redirecionar para a página inicial (não voltar ao login).
- [ ] Se pedir login de novo ou der "Acesso negado", seguir RECUPERACAO_SISTEMA.md (sessão/cookies).

---

## 4. CRUD de vendedores

- [ ] Ir até a tela de **Vendedores** (ou Cadastro de Vendedor).
- [ ] **Listar:** a lista de vendedores deve carregar (pode estar vazia).
- [ ] **Criar:** preencher nome, cidade e senha (6 dígitos), clicar em Salvar.
- [ ] Deve aparecer mensagem de sucesso e a **lista deve atualizar** sozinha (sem dar F5), mostrando o novo vendedor.
- [ ] **Editar:** clicar em Editar em um vendedor, alterar algo, Salvar. Lista deve atualizar.
- [ ] **Excluir:** clicar em Excluir em um vendedor (pode ser o de teste), confirmar. Lista deve atualizar.
- Se a lista **não** atualizar após salvar/editar/excluir, ver CONVENCOES_DE_CODIGO.md (invalidar lista após mutation).

---

## 5. Listas principais

- [ ] Abrir **Pedidos** (ou equivalente): a lista deve carregar (pode estar vazia), sem erro na tela.
- [ ] Abrir **Cargas** (ou equivalente): a lista deve carregar, sem erro na tela.
- Se aparecer erro de "Failed query" ou TRPCError, anotar e seguir RECUPERACAO_SISTEMA.md (coletar err.code e err.sqlMessage).

---

## 6. Debug de sessão (só em desenvolvimento)

- [ ] Com o usuário logado, abrir `http://localhost:3003/api/debug/headers` (porta correta).
- [ ] A resposta deve mostrar algo em `cookie` ou `xSessionToken` (não vazio). Se estiver vazio com usuário logado, o cookie não está sendo enviado (ver RECUPERACAO_SISTEMA.md).

---

## O que coletar se algo falhar

- **Tela de login / "precisa estar logado":**  
  - Valor de cookie/session no DevTools (Application → Cookies).  
  - Resposta de `/api/debug/headers`.  
  - Trecho do log do servidor com `[createContext]`.

- **Erro de tela (TRPCError / Failed query):**  
  - No log do servidor: linha com `[TRPC onError] traceId: ...` e as linhas com `err.code` e `err.sqlMessage`.  
  - Resposta de `/api/health` (status, schemaMatch, schemaVersion, expectedSchemaVersion).

- **Lista não atualiza:**  
  - Qual tela e qual ação (criar/editar/excluir).  
  - Se naquele fluxo está sendo chamado invalidate/refetch da lista (ver código ou CONVENCOES_DE_CODIGO.md).

- **Botão não salva / fica travado:**  
  - Se o botão usa estado local (isSubmitting) ou loading global.  
  - Mensagem de erro na tela ou no console do navegador.

Com essas informações, um desenvolvedor ou o manual (RECUPERACAO_SISTEMA.md, CONVENCOES_DE_CODIGO.md) pode orientar o próximo passo.
