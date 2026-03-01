# Relatório completo – Blindagem do sistema (Hardening)

Este relatório explica, em linguagem simples, o que foi feito para deixar o sistema **estável, seguro e fácil de diagnosticar**. Serve para quem não programa: gestores, suporte ou novos desenvolvedores.

---

## 1. O que foi implementado (arquivos e mudanças)

### Configuração e ambiente (DEV vs PROD)

- **loadEnv** (server/_core/loadEnv.ts): o servidor passa a carregar primeiro o arquivo `.env` e depois `.env.development` ou `.env.production`, conforme o modo (desenvolvimento ou produção). Assim, desenvolvimento e produção podem usar configurações diferentes sem misturar.
- **Arquivos de exemplo:** `.env.example`, `.env.development.example`, `.env.production.example` – mostram quais variáveis são obrigatórias (banco, porta, URL do tRPC) e servem de modelo para copiar e preencher.

### Proteção contra perda de dados

- **db:push:dev** e **db:push:prod** (package.json + server/scripts/db-push-prod.js): em **produção** o comando que faria “push” do banco **não executa**; ele só mostra um aviso e sai com erro. Assim ninguém roda por engano um comando que pode apagar ou alterar dados em produção.
- **Migrations** (drizzle/migrations, db:generate, db:migrate): as mudanças de estrutura do banco passam a ser feitas por **migrações versionadas** (arquivos de texto que descrevem cada mudança). Em produção só se aplica o que foi revisado; não se usa mais “push” direto.

### Versão do banco (schema)

- **Tabela schema_version** (drizzle/schema.ts + server/db.ts): o banco guarda um número de “versão” do esquema. O código também tem um número esperado (EXPECTED_SCHEMA_VERSION em server/_core/schemaVersion.ts). Assim dá para saber se o banco está alinhado com o que o programa espera.
- **Lógica de leitura e comparação:** o endpoint de saúde (/api/health) lê a versão do banco e compara com a esperada; não altera nada sozinho em produção.

### Endpoints de diagnóstico

- **GET /api/health:** devolve se o banco está ok, tempo de conexão, nome do banco, versão do schema no banco, versão esperada pelo código, se batem (schemaMatch), tempo de atividade do servidor e ambiente (dev/prod). É o primeiro lugar para olhar quando algo “não conecta” ou “deu erro estranho”.
- **GET /api/debug/headers:** só existe em **desenvolvimento**. Mostra o que o servidor recebeu de cookie, token de sessão e cabeçalho de autorização. Serve para descobrir por que às vezes “precisa estar logado” mesmo após login.

### Logs e rastreio de erros

- **Logs de erro SQL** (server/db.ts): em todo erro de banco o servidor registra no log: código do erro, número do erro, estado SQL, mensagem SQL e a consulta (quando houver). Isso evita ficar “no escuro” quando uma tela ou API quebra por causa do banco.
- **TraceId** (server/_core/index.ts): cada erro da API (tRPC) gera um **ID único** (traceId). Esse ID aparece no log e no Sentry. Quem estiver investigando consegue achar exatamente aquele erro no servidor ou no Sentry usando esse ID.

### Regras de sessão (cliente)

- **Uma única instância** do cliente tRPC e do QueryClient (já existia em main.tsx e trpcClient.ts); foi mantido e documentado.
- **credentials: "include"** no fetch (trpcClient.ts): o navegador envia os cookies na mesma origem; necessário para o login por cookie funcionar. Não foi removido.

### Padrão de CRUD e botões

- **invalidateAfterMutation** (client/src/utils/invalidateAfterMutation.ts): função auxiliar que, após criar/editar/excluir um registro, “invalida” a lista correspondente para ela atualizar na tela sem precisar dar F5.
- **Padrão de botões/formulários:** na tela de Login e na de Vendedores foi aplicado o padrão: botão desabilitado só quando os campos obrigatórios estão vazios **ou** quando o envio está em andamento (estado **local**). Não se usa mais um “loading global” para travar o botão, o que evitava o problema de “cursor proibido” ou botão que nunca habilita.

### Documentação criada/atualizada

- **docs/RISCO_ATUAL.md:** descreve os riscos do sistema (perda de dados, banco fora do schema, sessão, lista que não atualiza, bugs difíceis, deploy) e o que fazer para cada um.
- **docs/RECUPERACAO_SISTEMA.md:** roteiro de emergência (MySQL, sessão/cookies, db:push, migrations, Sentry, logs, traceId, lista não atualiza, botão não salva).
- **docs/DEPLOY_PRODUCAO.md:** procedimento seguro (backup, migrations, healthcheck, smoke test, rollback).
- **docs/CONVENCOES_DE_CODIGO.md:** regras obrigatórias para novas telas e CRUD (formulário, tabela/coluna, “precisa estar logado”, TRPCError/Failed query).
- **docs/BASE_DE_DADOS.md:** configuração MySQL/XAMPP, exemplos de .env, comandos de banco, política DEV vs PROD.
- **docs/TESTE_RAPIDO.md:** checklist passo a passo (pré-requisitos, login, CRUD vendedores, listas, healthcheck, o que coletar se falhar).
- **Comentário no código** (server/_core/index.ts): lembrete breve dos riscos e referência aos docs.

---

## 2. O que já estava correto antes

- Uma única instância do cliente tRPC e do QueryClient.
- Fetch com credentials: "include".
- Tela de Vendedores já invalidava a lista após criar/editar/excluir; o helper invalidateAfterMutation só padroniza e documenta isso.
- Login já usava estado local (isLoggingIn) para o botão; foi reforçado e documentado.
- Logs de erro SQL e traceId no onError do tRPC já tinham sido implementados; foram mantidos e referenciados na documentação.

---

## 3. Scripts adicionados ao package.json

| Script | O que faz |
|--------|-----------|
| **db:push:dev** | Sincroniza o schema do código com o banco **só em desenvolvimento**. Pode pedir confirmação. |
| **db:push:prod** | **Não executa nada.** Só mostra aviso de perigo e instrui a usar migrations. Sai com código de erro 1. |
| **db:generate** | Gera arquivos de migração (em drizzle/migrations) a partir do schema atual do código. |
| **db:migrate** | Aplica as migrações pendentes no banco (usado em dev e, com cuidado, em produção após backup). |

Os demais scripts (dev, build, check:db, etc.) continuam como antes.

---

## 4. Endpoints criados

| Endpoint | Quando existe | O que retorna |
|----------|----------------|----------------|
| **GET /api/health** | Sempre | status do banco (ok/error), tempo de conexão, nome do banco, schemaVersion (do banco), expectedSchemaVersion (do código), schemaMatch (true/false), uptime em segundos, nodeEnv. |
| **GET /api/debug/headers** | Só quando NODE_ENV=development | cookie recebido, x-session-token, authorization. |

---

## 5. Como verificar se o sistema está saudável

1. **Abra no navegador:** `http://SEU_SERVIDOR:PORTA/api/health` (ex.: http://localhost:3003/api/health).
2. **Veja a resposta:** deve ter algo como `"db": { "status": "ok" }` e `"schemaMatch": true`.
3. **Se schemaMatch for false:** o banco está em uma versão diferente da que o código espera; é preciso aplicar a migração pendente (ou, só em dev, usar db:push:dev conforme BASE_DE_DADOS.md).
4. **Faça o teste rápido:** siga o checklist em **docs/TESTE_RAPIDO.md** (login, listar vendedores, criar/editar/excluir, listar de novo, listar pedidos/cargas).

Se o health estiver ok e o teste rápido passar, o sistema está saudável para uso normal.

---

## 6. O que fazer se der erro

- **Não conecta ao banco / “Database not available”:** Ver docs/RECUPERACAO_SISTEMA.md (MySQL/XAMPP, check:db). Conferir .env (DATABASE_URL ou DB_*).
- **“Precisa estar logado” ou redireciona para login:** Ver docs/RECUPERACAO_SISTEMA.md (sessão/cookies). Ordem: 1) cookie no navegador 2) /api/debug/headers (só em dev) 3) logs do servidor (createContext) 4) CORS.
- **Erro “Failed query” ou TRPCError em tela:** Ver docs/RECUPERACAO_SISTEMA.md e docs/CONVENCOES_DE_CODIGO.md. Coletar no log do servidor: **traceId**, **err.code** e **err.sqlMessage**. Conferir /api/health (schemaMatch).
- **Lista não atualiza após salvar:** Ver docs/CONVENCOES_DE_CODIGO.md (invalidar lista após mutation).
- **Botão não habilita / “cursor proibido”:** Ver docs/CONVENCOES_DE_CODIGO.md (usar isSubmitting local, não loading global).

Em todos os casos, a documentação em **/docs** é o manual interno permanente; não depende de memória ou conversa.

---

## 7. Quais informações coletar para diagnóstico

Quando algo falhar, anotar (ou enviar para quem for corrigir):

- **Para problema de login/sessão:** valor do cookie no DevTools (Application → Cookies); resposta de /api/debug/headers (em dev); trecho do log do servidor com “[createContext]”.
- **Para erro de tela/API (TRPCError):** no log do servidor: a linha com **traceId** e as linhas com **err.code** e **err.sqlMessage** (se for erro de banco). Resposta de **/api/health** (status, schemaMatch, schemaVersion, expectedSchemaVersion).
- **Para “lista não atualiza”:** qual tela e qual ação (criar/editar/excluir); se naquele fluxo está sendo feita a invalidação da lista (ver código ou CONVENCOES_DE_CODIGO.md).
- **Para “botão não salva”:** se o botão usa estado local (isSubmitting) ou loading global; mensagem de erro na tela ou no console do navegador.

Com isso, qualquer desenvolvedor ou o próprio manual (RECUPERACAO_SISTEMA, CONVENCOES_DE_CODIGO) consegue orientar o próximo passo.

---

## 8. Pontos ainda frágeis (se existirem)

- **Primeira migração:** Se o banco já foi criado com db:push no passado, a primeira vez que se usa “migrations” pode exigir gerar uma migração inicial (db:generate) e, se necessário, ajustar manualmente ou rodar em dev primeiro. Ver BASE_DE_DADOS.md.
- **expectedSchemaVersion:** Precisa ser incrementado manualmente no código (server/_core/schemaVersion.ts) sempre que uma nova migração mudar o “contrato” do schema. Está documentado em BASE_DE_DADOS.md e CONVENCOES_DE_CODIGO.md.
- **Deploy em produção:** Continua responsabilidade humana fazer backup antes de migração e seguir DEPLOY_PRODUCAO.md; o sistema não faz backup sozinho.

Nada disso quebra o dia a dia; são pontos de atenção documentados.

---

## 9. Passo a passo para replicar em outra máquina

1. Instalar Node.js e npm (ou pnpm) e MySQL (ou XAMPP com MySQL).
2. Clonar ou copiar o projeto na pasta desejada.
3. Na pasta do projeto: `npm install` (ou `pnpm install`).
4. Copiar `.env.example` para `.env` (e, se quiser, `.env.development.example` para `.env.development`). Preencher pelo menos: DATABASE_URL (ou DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME), PORT, e se o front rodar em outro lugar, VITE_TRPC_URL.
5. Criar o banco no MySQL (ex.: `CREATE DATABASE vendas_app;`) e usuário com permissão (ver BASE_DE_DADOS.md).
6. Rodar `npm run check:db` e conferir “Conexão estabelecida”.
7. Rodar `npm run db:push:dev` (ou, se já houver migrações, `npm run db:migrate`) para alinhar o banco ao schema.
8. Rodar `npm run dev` e abrir no navegador a URL indicada (ex.: http://localhost:3003).
9. Abrir /api/health e conferir db.status ok e schemaMatch true.
10. Fazer login (criar um admin antes com seed:admin se necessário) e seguir o TESTE_RAPIDO.md.

A partir daí o sistema está replicado e estável naquela máquina.

---

## 10. Checklist para o desenvolvedor iniciante

- [ ] Li docs/RISCO_ATUAL.md e sei que não devo rodar db:push em produção.
- [ ] Sei que em produção uso migrations (db:generate → revisar SQL → db:migrate) e backup (ver DEPLOY_PRODUCAO.md).
- [ ] Ao criar nova tela com formulário: uso isSubmitting local, validação, toast e invalido a lista após salvar (ver CONVENCOES_DE_CODIGO.md).
- [ ] Ao criar nova tabela/coluna: altero drizzle/schema.ts, rodo db:generate, reviso SQL, rodo db:migrate e atualizo EXPECTED_SCHEMA_VERSION (ver CONVENCOES_DE_CODIGO e BASE_DE_DADOS).
- [ ] Se alguém disser “precisa estar logado”: sigo a ordem cookie → /api/debug/headers → logs createContext → CORS (ver RECUPERACAO_SISTEMA e CONVENCOES_DE_CODIGO).
- [ ] Se aparecer TRPCError ou “Failed query”: anoto traceId, err.code e err.sqlMessage do log e confiro /api/health (ver RECUPERACAO_SISTEMA e CONVENCOES_DE_CODIGO).
- [ ] Antes de dar por encerrado um deploy ou uma mudança grande: rodo o TESTE_RAPIDO.md e confiro /api/health.

---

**Objetivo final:** sistema estável, diagnosticável e pronto para evoluir sem crises. Todas as regras e procedimentos estão na pasta **/docs**; o sistema não depende de memória ou conversa para ser mantido.
