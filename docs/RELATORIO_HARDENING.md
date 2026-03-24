# RelatÃ³rio completo â€“ Blindagem do sistema (Hardening)

Este relatÃ³rio explica, em linguagem simples, o que foi feito para deixar o sistema **estÃ¡vel, seguro e fÃ¡cil de diagnosticar**. Serve para quem nÃ£o programa: gestores, suporte ou novos desenvolvedores.

---

## 1. O que foi implementado (arquivos e mudanÃ§as)

### ConfiguraÃ§Ã£o e ambiente (DEV vs PROD)

- **loadEnv** (server/_core/loadEnv.ts): o servidor passa a carregar primeiro o arquivo `.env` e depois `.env.development` ou `.env.production`, conforme o modo (desenvolvimento ou produÃ§Ã£o). Assim, desenvolvimento e produÃ§Ã£o podem usar configuraÃ§Ãµes diferentes sem misturar.
- **Arquivos de exemplo:** `.env.example`, `.env.development.example`, `.env.production.example` â€“ mostram quais variÃ¡veis sÃ£o obrigatÃ³rias (banco, porta, URL do tRPC) e servem de modelo para copiar e preencher.

### ProteÃ§Ã£o contra perda de dados

- **db:push:dev** e **db:push:prod** (package.json + server/scripts/db-push-prod.js): em **produÃ§Ã£o** o comando que faria â€œpushâ€ do banco **nÃ£o executa**; ele sÃ³ mostra um aviso e sai com erro. Assim ninguÃ©m roda por engano um comando que pode apagar ou alterar dados em produÃ§Ã£o.
- **Migrations** (drizzle/migrations, db:generate, db:migrate): as mudanÃ§as de estrutura do banco passam a ser feitas por **migraÃ§Ãµes versionadas** (arquivos de texto que descrevem cada mudanÃ§a). Em produÃ§Ã£o sÃ³ se aplica o que foi revisado; nÃ£o se usa mais â€œpushâ€ direto.

### VersÃ£o do banco (schema)

- **Tabela schema_version** (drizzle/schema.ts + server/db.ts): o banco guarda um nÃºmero de â€œversÃ£oâ€ do esquema. O cÃ³digo tambÃ©m tem um nÃºmero esperado (EXPECTED_SCHEMA_VERSION em server/_core/schemaVersion.ts). Assim dÃ¡ para saber se o banco estÃ¡ alinhado com o que o programa espera.
- **LÃ³gica de leitura e comparaÃ§Ã£o:** o endpoint de saÃºde (/api/health) lÃª a versÃ£o do banco e compara com a esperada; nÃ£o altera nada sozinho em produÃ§Ã£o.

### Endpoints de diagnÃ³stico

- **GET /api/health:** devolve se o banco estÃ¡ ok, tempo de conexÃ£o, nome do banco, versÃ£o do schema no banco, versÃ£o esperada pelo cÃ³digo, se batem (schemaMatch), tempo de atividade do servidor e ambiente (dev/prod). Ã‰ o primeiro lugar para olhar quando algo â€œnÃ£o conectaâ€ ou â€œdeu erro estranhoâ€.
- **GET /api/debug/headers:** sÃ³ existe em **desenvolvimento**. Mostra o que o servidor recebeu de cookie, token de sessÃ£o e cabeÃ§alho de autorizaÃ§Ã£o. Serve para descobrir por que Ã s vezes â€œprecisa estar logadoâ€ mesmo apÃ³s login.

### Logs e rastreio de erros

- **Logs de erro SQL** (server/db.ts): em todo erro de banco o servidor registra no log: cÃ³digo do erro, nÃºmero do erro, estado SQL, mensagem SQL e a consulta (quando houver). Isso evita ficar â€œno escuroâ€ quando uma tela ou API quebra por causa do banco.
- **TraceId** (server/_core/index.ts): cada erro da API (tRPC) gera um **ID Ãºnico** (traceId). Esse ID aparece no log e no Sentry. Quem estiver investigando consegue achar exatamente aquele erro no servidor ou no Sentry usando esse ID.

### Regras de sessÃ£o (cliente)

- **Uma Ãºnica instÃ¢ncia** do cliente tRPC e do QueryClient (jÃ¡ existia em main.tsx e trpcClient.ts); foi mantido e documentado.
- **credentials: "include"** no fetch (trpcClient.ts): o navegador envia os cookies na mesma origem; necessÃ¡rio para o login por cookie funcionar. NÃ£o foi removido.

### PadrÃ£o de CRUD e botÃµes

- **invalidateAfterMutation** (client/src/utils/invalidateAfterMutation.ts): funÃ§Ã£o auxiliar que, apÃ³s criar/editar/excluir um registro, â€œinvalidaâ€ a lista correspondente para ela atualizar na tela sem precisar dar F5.
- **PadrÃ£o de botÃµes/formulÃ¡rios:** na tela de Login e na de Vendedores foi aplicado o padrÃ£o: botÃ£o desabilitado sÃ³ quando os campos obrigatÃ³rios estÃ£o vazios **ou** quando o envio estÃ¡ em andamento (estado **local**). NÃ£o se usa mais um â€œloading globalâ€ para travar o botÃ£o, o que evitava o problema de â€œcursor proibidoâ€ ou botÃ£o que nunca habilita.

### DocumentaÃ§Ã£o criada/atualizada

- **docs/RISCO_ATUAL.md:** descreve os riscos do sistema (perda de dados, banco fora do schema, sessÃ£o, lista que nÃ£o atualiza, bugs difÃ­ceis, deploy) e o que fazer para cada um.
- **docs/RECUPERACAO_SISTEMA.md:** roteiro de emergÃªncia (MySQL, sessÃ£o/cookies, db:push, migrations, Sentry, logs, traceId, lista nÃ£o atualiza, botÃ£o nÃ£o salva).
- **docs/DEPLOY_PRODUCAO.md:** procedimento seguro (backup, migrations, healthcheck, smoke test, rollback).
- **docs/CONVENCOES_DE_CODIGO.md:** regras obrigatÃ³rias para novas telas e CRUD (formulÃ¡rio, tabela/coluna, â€œprecisa estar logadoâ€, TRPCError/Failed query).
- **docs/BASE_DE_DADOS.md:** configuraÃ§Ã£o MySQL/XAMPP, exemplos de .env, comandos de banco, polÃ­tica DEV vs PROD.
- **docs/TESTE_RAPIDO.md:** checklist passo a passo (prÃ©-requisitos, login, CRUD vendedores, listas, healthcheck, o que coletar se falhar).
- **ComentÃ¡rio no cÃ³digo** (server/_core/index.ts): lembrete breve dos riscos e referÃªncia aos docs.

---

## 2. O que jÃ¡ estava correto antes

- Uma Ãºnica instÃ¢ncia do cliente tRPC e do QueryClient.
- Fetch com credentials: "include".
- Tela de Vendedores jÃ¡ invalidava a lista apÃ³s criar/editar/excluir; o helper invalidateAfterMutation sÃ³ padroniza e documenta isso.
- Login jÃ¡ usava estado local (isLoggingIn) para o botÃ£o; foi reforÃ§ado e documentado.
- Logs de erro SQL e traceId no onError do tRPC jÃ¡ tinham sido implementados; foram mantidos e referenciados na documentaÃ§Ã£o.

---

## 3. Scripts adicionados ao package.json

| Script | O que faz |
|--------|-----------|
| **db:push:dev** | Sincroniza o schema do cÃ³digo com o banco **sÃ³ em desenvolvimento**. Pode pedir confirmaÃ§Ã£o. |
| **db:push:prod** | **NÃ£o executa nada.** SÃ³ mostra aviso de perigo e instrui a usar migrations. Sai com cÃ³digo de erro 1. |
| **db:generate** | Gera arquivos de migraÃ§Ã£o (em drizzle/migrations) a partir do schema atual do cÃ³digo. |
| **db:migrate** | Aplica as migraÃ§Ãµes pendentes no banco (usado em dev e, com cuidado, em produÃ§Ã£o apÃ³s backup). |

Os demais scripts (dev, build, check:db, etc.) continuam como antes.

---

## 4. Endpoints criados

| Endpoint | Quando existe | O que retorna |
|----------|----------------|----------------|
| **GET /api/health** | Sempre | status do banco (ok/error), tempo de conexÃ£o, nome do banco, schemaVersion (do banco), expectedSchemaVersion (do cÃ³digo), schemaMatch (true/false), uptime em segundos, nodeEnv. |
| **GET /api/debug/headers** | SÃ³ quando NODE_ENV=development | cookie recebido, x-session-token, authorization. |

---

## 5. Como verificar se o sistema estÃ¡ saudÃ¡vel

1. **Abra no navegador:** `http://SEU_SERVIDOR:PORTA/api/health` (ex.: http://localhost:3000/api/health).
2. **Veja a resposta:** deve ter algo como `"db": { "status": "ok" }` e `"schemaMatch": true`.
3. **Se schemaMatch for false:** o banco estÃ¡ em uma versÃ£o diferente da que o cÃ³digo espera; Ã© preciso aplicar a migraÃ§Ã£o pendente (ou, sÃ³ em dev, usar db:push:dev conforme BASE_DE_DADOS.md).
4. **FaÃ§a o teste rÃ¡pido:** siga o checklist em **docs/TESTE_RAPIDO.md** (login, listar vendedores, criar/editar/excluir, listar de novo, listar pedidos/cargas).

Se o health estiver ok e o teste rÃ¡pido passar, o sistema estÃ¡ saudÃ¡vel para uso normal.

---

## 6. O que fazer se der erro

- **NÃ£o conecta ao banco / â€œDatabase not availableâ€:** Ver docs/RECUPERACAO_SISTEMA.md (MySQL/XAMPP, check:db). Conferir .env (DATABASE_URL ou DB_*).
- **â€œPrecisa estar logadoâ€ ou redireciona para login:** Ver docs/RECUPERACAO_SISTEMA.md (sessÃ£o/cookies). Ordem: 1) cookie no navegador 2) /api/debug/headers (sÃ³ em dev) 3) logs do servidor (createContext) 4) CORS.
- **Erro â€œFailed queryâ€ ou TRPCError em tela:** Ver docs/RECUPERACAO_SISTEMA.md e docs/CONVENCOES_DE_CODIGO.md. Coletar no log do servidor: **traceId**, **err.code** e **err.sqlMessage**. Conferir /api/health (schemaMatch).
- **Lista nÃ£o atualiza apÃ³s salvar:** Ver docs/CONVENCOES_DE_CODIGO.md (invalidar lista apÃ³s mutation).
- **BotÃ£o nÃ£o habilita / â€œcursor proibidoâ€:** Ver docs/CONVENCOES_DE_CODIGO.md (usar isSubmitting local, nÃ£o loading global).

Em todos os casos, a documentaÃ§Ã£o em **/docs** Ã© o manual interno permanente; nÃ£o depende de memÃ³ria ou conversa.

---

## 7. Quais informaÃ§Ãµes coletar para diagnÃ³stico

Quando algo falhar, anotar (ou enviar para quem for corrigir):

- **Para problema de login/sessÃ£o:** valor do cookie no DevTools (Application â†’ Cookies); resposta de /api/debug/headers (em dev); trecho do log do servidor com â€œ[createContext]â€.
- **Para erro de tela/API (TRPCError):** no log do servidor: a linha com **traceId** e as linhas com **err.code** e **err.sqlMessage** (se for erro de banco). Resposta de **/api/health** (status, schemaMatch, schemaVersion, expectedSchemaVersion).
- **Para â€œlista nÃ£o atualizaâ€:** qual tela e qual aÃ§Ã£o (criar/editar/excluir); se naquele fluxo estÃ¡ sendo feita a invalidaÃ§Ã£o da lista (ver cÃ³digo ou CONVENCOES_DE_CODIGO.md).
- **Para â€œbotÃ£o nÃ£o salvaâ€:** se o botÃ£o usa estado local (isSubmitting) ou loading global; mensagem de erro na tela ou no console do navegador.

Com isso, qualquer desenvolvedor ou o prÃ³prio manual (RECUPERACAO_SISTEMA, CONVENCOES_DE_CODIGO) consegue orientar o prÃ³ximo passo.

---

## 8. Pontos ainda frÃ¡geis (se existirem)

- **Primeira migraÃ§Ã£o:** Se o banco jÃ¡ foi criado com db:push no passado, a primeira vez que se usa â€œmigrationsâ€ pode exigir gerar uma migraÃ§Ã£o inicial (db:generate) e, se necessÃ¡rio, ajustar manualmente ou rodar em dev primeiro. Ver BASE_DE_DADOS.md.
- **expectedSchemaVersion:** Precisa ser incrementado manualmente no cÃ³digo (server/_core/schemaVersion.ts) sempre que uma nova migraÃ§Ã£o mudar o â€œcontratoâ€ do schema. EstÃ¡ documentado em BASE_DE_DADOS.md e CONVENCOES_DE_CODIGO.md.
- **Deploy em produÃ§Ã£o:** Continua responsabilidade humana fazer backup antes de migraÃ§Ã£o e seguir DEPLOY_PRODUCAO.md; o sistema nÃ£o faz backup sozinho.

Nada disso quebra o dia a dia; sÃ£o pontos de atenÃ§Ã£o documentados.

---

## 9. Passo a passo para replicar em outra mÃ¡quina

1. Instalar Node.js e npm (ou pnpm) e MySQL (ou XAMPP com MySQL).
2. Clonar ou copiar o projeto na pasta desejada.
3. Na pasta do projeto: `npm install` (ou `pnpm install`).
4. Copiar `.env.example` para `.env` (e, se quiser, `.env.development.example` para `.env.development`). Preencher pelo menos: DATABASE_URL (ou DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME), PORT, e se o front rodar em outro lugar, VITE_TRPC_URL.
5. Criar o banco no MySQL (ex.: `CREATE DATABASE vendas_app;`) e usuÃ¡rio com permissÃ£o (ver BASE_DE_DADOS.md).
6. Rodar `npm run check:db` e conferir â€œConexÃ£o estabelecidaâ€.
7. Rodar `npm run db:push:dev` (ou, se jÃ¡ houver migraÃ§Ãµes, `npm run db:migrate`) para alinhar o banco ao schema.
8. Rodar `npm run dev` e abrir no navegador a URL indicada (ex.: http://localhost:3000).
9. Abrir /api/health e conferir db.status ok e schemaMatch true.
10. Fazer login (criar um admin antes com seed:admin se necessÃ¡rio) e seguir o TESTE_RAPIDO.md.

A partir daÃ­ o sistema estÃ¡ replicado e estÃ¡vel naquela mÃ¡quina.

---

## 10. Checklist para o desenvolvedor iniciante

- [ ] Li docs/RISCO_ATUAL.md e sei que nÃ£o devo rodar db:push em produÃ§Ã£o.
- [ ] Sei que em produÃ§Ã£o uso migrations (db:generate â†’ revisar SQL â†’ db:migrate) e backup (ver DEPLOY_PRODUCAO.md).
- [ ] Ao criar nova tela com formulÃ¡rio: uso isSubmitting local, validaÃ§Ã£o, toast e invalido a lista apÃ³s salvar (ver CONVENCOES_DE_CODIGO.md).
- [ ] Ao criar nova tabela/coluna: altero drizzle/schema.ts, rodo db:generate, reviso SQL, rodo db:migrate e atualizo EXPECTED_SCHEMA_VERSION (ver CONVENCOES_DE_CODIGO e BASE_DE_DADOS).
- [ ] Se alguÃ©m disser â€œprecisa estar logadoâ€: sigo a ordem cookie â†’ /api/debug/headers â†’ logs createContext â†’ CORS (ver RECUPERACAO_SISTEMA e CONVENCOES_DE_CODIGO).
- [ ] Se aparecer TRPCError ou â€œFailed queryâ€: anoto traceId, err.code e err.sqlMessage do log e confiro /api/health (ver RECUPERACAO_SISTEMA e CONVENCOES_DE_CODIGO).
- [ ] Antes de dar por encerrado um deploy ou uma mudanÃ§a grande: rodo o TESTE_RAPIDO.md e confiro /api/health.

---

**Objetivo final:** sistema estÃ¡vel, diagnosticÃ¡vel e pronto para evoluir sem crises. Todas as regras e procedimentos estÃ£o na pasta **/docs**; o sistema nÃ£o depende de memÃ³ria ou conversa para ser mantido.
