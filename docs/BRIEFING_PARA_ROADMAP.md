# Briefing para o GPT montar um ROADMAP do projeto GRS

**Objetivo:** Você (GPT) vai usar este documento como contexto completo do projeto para criar um **roadmap** (fases, prioridades, próximos passos). Copie e cole este arquivo inteiro no chat do GPT quando pedir o roadmap.

---

## 1. O que é o projeto

- **Nome:** GRS – Sistema de Gestão e Finanças (gestão de vendas, pedidos, cargas, vendedores e financeiro).
- **Público:** Pequena equipe: **8 vendedores + 1 admin**. Uso interno, não é SaaS multi-tenant.
- **Objetivo:** Controlar pedidos, clientes, produtos, estoque, cargas, financeiro (caixa, contas a receber/pagar, boletos, comissões), pendências de compra, notas de entrada e relatórios/diagnóstico.
- **Ambiente:** Desenvolvimento em Windows (XAMPP/MySQL). Produção futura em servidor com MySQL.

---

## 2. Stack tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, Vite, Tailwind CSS, tRPC + React Query, wouter (rotas), Sonner (toast) |
| Backend | Node.js, Express, tRPC, Drizzle ORM |
| Banco | MySQL (porta 3306), XAMPP em dev |
| Auth | Sessão por cookie + token; login local (vendedores cadastrados no sistema) |
| Outros | Zod (validação), nanoid (traceId), Sentry (erros), jsPDF (boletos/relatórios) |

---

## 3. Estrutura de pastas (resumo)

```
GRS ATUAL/
├── client/                 # Frontend React
│   └── src/
│       ├── pages/          # Telas (Home, Login, Vendedores, NovaVenda, Pedidos, Clientes, Produtos, Estoque, Cargas, Financeiro, etc.)
│       ├── components/     # Componentes reutilizáveis e layout (AppShell, etc.)
│       ├── lib/            # trpcClient, etc.
│       ├── store/          # authStore (Zustand)
│       ├── config/         # menuConfig (menu lateral por perfil)
│       └── _core/          # hooks, env
├── server/
│   ├── _core/              # index (Express + tRPC), context (auth), loadEnv, schemaVersion
│   ├── routes/             # Rotas HTTP legadas (produtos, etc.)
│   ├── routers.ts          # Todas as rotas tRPC (auth, vendedores, pedidos, produtos, cargas, financeiro, diagnóstico, etc.)
│   ├── db.ts               # Acesso a dados (Drizzle), transações, audit_log, diagnóstico
│   ├── scripts/            # test-db, check-database, run-migrate, db-push-prod, seed-admin
│   └── tests/              # run-core-tests.ts (estoque negativo, rollback, diagnóstico)
├── drizzle/
│   ├── schema.ts           # Definição das tabelas
│   └── migrations/         # Migrações versionadas
├── scripts/                # .bat para o usuário: BOTAO_1_INICIAR_DEV, BOTAO_2_TESTAR_SAUDE, BOTAO_3_BACKUP_DB_DEV, BOTAO_4_COMMIT_PUSH, BOTAO_RODAR_TESTES_CORE
└── docs/                   # Toda a documentação (ver lista abaixo)
```

---

## 4. O que já existe (funcionalidades e telas)

### Menu / Módulos (por grupo)

- **PAINEL:** Dashboard (Home).
- **COMERCIAL:** Novo Pedido (NovaVenda), Pedidos (lista / Meus Pedidos), Clientes (lista + cadastro), Promoções.
- **OPERACIONAL:** Produtos (Catálogo, Estoque), Pendências de Compra, Cerco de Cargas, Nota de Entrada.
- **LOGÍSTICA:** Entregas.
- **FINANCEIRO:** Minhas Comissões (vendedor), Boletos, Financeiro (admin), Histórico de Caixa, Contas a Receber, Contas a Pagar, Contas Fixas, Plano de Contas.
- **RELATÓRIOS:** Relatórios, Diagnóstico (admin – consistência do banco).
- **CADASTROS:** Cadastro geral, Vendedores, Fornecedores, Grupos de Precificação, Cores, Configurações do Banco.

### Regras de negócio já implementadas

- **Login obrigatório:** Sempre passa pela tela de login (sem auto-login por cookie). "Lembrar usuário" (localStorage). Trocar usuário / Sair limpam sessão.
- **Perfis:** admin e vendedor; algumas telas só para admin (Vendedores, Diagnóstico, Contas a Pagar, etc.).
- **Pedidos:** Criar pedido (createVenda) em transação; itens, cliente opcional novo; totais calculados no backend. Baixa de pedido (baixarPedidoDireto) em transação: contas a receber, caixa, comissão.
- **Estoque:** Nunca negativo (validação no backend); toda movimentação registrada em audit_log (ENTRADA/SAIDA). Nota de entrada em transação (estoque + financeiro).
- **Financeiro:** Caixa mensal, contas a receber/pagar, boletos (geração ZIP), comissões.
- **Auditoria:** audit_log para create/update/delete vendedor, create/baixa pedido, movimentação estoque (tipo, quantidade, saldoAnterior, saldoNovo, motivo, actor, traceId).
- **Diagnóstico (admin):** Endpoint `diagnostico.run` verifica: pedidos sem itens, itens sem produto, pendencias quebradas, totais inconsistentes, estoque negativo, contas a receber órfãs. Retorna tipoProblema, entidade, id, detalhe, sugestao.

---

## 5. O que já foi feito (hardening, ERRO ZERO, Git, docs)

- **Ambiente:** .env / .env.development / .env.production; NODE_ENV; variáveis documentadas (DATABASE_URL ou DB_*, PORT, VITE_TRPC_URL).
- **Banco:** db:push só em DEV (db:push:dev); db:push:prod aborta (exit 1). Migrações versionadas (db:generate, db:migrate). Tabela schema_version; EXPECTED_SCHEMA_VERSION no código; /api/health retorna db.status, schemaVersion, expectedSchemaVersion, schemaMatch.
- **Sessão:** /api/debug/headers só em DEV. tRPC com credentials: "include". traceId em erros tRPC (nanoid). Logs SQL padronizados (err.code, err.errno, err.sqlState, err.sqlMessage).
- **CRUD:** Padrão invalidateAfterMutation; botões com isSubmitting/canSubmit local (não loading global).
- **Transações:** createVenda, baixarPedidoDireto, criarNotaEntrada em transação; rollback testado em test:core.
- **Testes:** npm run test:core (bloqueio estoque negativo, rollback, formato do diagnóstico). test:db e check:db para conexão MySQL.
- **Git:** Branch main (produção estável) e dev (desenvolvimento); commits pequenos; documentação de workflow (WORKFLOW_GIT.md, LEMBRETE_COMMIT.md).
- **Scripts .bat:** Iniciar DEV, Testar Saúde, Backup DB Dev, Commit/Push, Rodar Testes Core.

---

## 6. Regras e convenções que NÃO podem ser ignoradas (para o roadmap)

- **Novas telas/CRUD:** isSubmitting local; validação mínima; toast sucesso/erro; invalidateAfterMutation após mutation; não usar loading global para botão.
- **Novas tabelas/colunas:** Alterar drizzle/schema.ts; db:generate; db:migrate (ou db:push:dev em dev); atualizar EXPECTED_SCHEMA_VERSION; nunca db:push em produção.
- **Produção:** Nunca db:push; sempre migrations + backup; healthcheck e smoke test após deploy.
- **IA/assistentes:** Não remover funcionalidades; não operações destrutivas no banco sem aviso/backup; não alterar .env sem aviso; respeitar docs em /docs (ver REGRAS_PARA_IA.md, CONVENCOES_DE_CODIGO.md).

---

## 7. Riscos conhecidos (evitar no roadmap)

| Risco | Mitigação já existente |
|-------|-------------------------|
| Perda de dados por db:push em prod | db:push:prod aborta; usar migrations + backup |
| Banco fora do schema | /api/health schemaMatch; migração ou db:push:dev |
| Sessão não reconhecida | Cookie, /api/debug/headers, logs context |
| Lista não atualiza após salvar | invalidateAfterMutation |
| Bugs difíceis de diagnosticar | traceId, err.code, err.sqlMessage nos logs |
| Deploy quebrar produção | Backup, migrations, healthcheck, smoke test |

---

## 8. Documentação disponível (pasta /docs)

- **BASE_DE_DADOS.md** – MySQL/XAMPP, .env, comandos db, política DEV vs PROD  
- **RECUPERACAO_SISTEMA.md** – Roteiro de emergência (MySQL, sessão, db:push, migrations, logs)  
- **DEPLOY_PRODUCAO.md** – Backup, migrations, healthcheck, smoke test, rollback  
- **CONVENCOES_DE_CODIGO.md** – Regras para novas telas, CRUD, login, erros SQL  
- **TESTE_RAPIDO.md** – Checklist smoke test (login, CRUD vendedores, listas, health, validação estoque/financeiro)  
- **WORKFLOW_GIT.md** / **LEMBRETE_COMMIT.md** – Branches dev/main, commits pequenos  
- **STATUS_PROJETO.md** – Checklist de projeto saudável  
- **RISCO_ATUAL.md** – Riscos e mitigações  
- **REGRAS_PARA_IA.md** – Regras para assistentes de código  
- **BACKUP_BANCO_DEV.md** – Backup do banco em dev  
- **RELATORIO_ERRO_ZERO_NUCLEO.md** – Invariantes estoque/financeiro, auditoria, diagnóstico, testes  
- **FAXINA-E-PROXIMOS-PASSOS.md** – Faxina já feita + próximos passos sugeridos (consistência visual, busca global, NovaVenda ?edit=, estado global/real-time, testes E2E)

---

## 9. Próximos passos já sugeridos (para integrar no roadmap)

- **Curto prazo:** Consistência visual entre telas; busca global (campo "Buscar" no AppShell); NovaVenda com edição (?edit=ID).
- **Médio prazo:** Salvar pedido com múltiplas ações e feedback; estado global (Context/Zustand) para admin ver mudanças do vendedor; garantir async/await e toast em ações críticas.
- **Longo prazo:** Hubs de rotas (/financeiro, /cadastros); notificações em tempo real (WebSocket/polling); testes E2E (Playwright/Cypress).

---

## 10. Informações técnicas úteis para o roadmap

- **Comandos principais:**  
  `npm run dev` (subir app), `npm run check` (TypeScript), `npm run test:db`, `npm run check:db`, `npm run test:core`, `npm run db:push:dev`, `npm run db:generate`, `npm run db:migrate`
- **Healthcheck:** GET /api/health (db.status, schemaMatch, schemaVersion, expectedSchemaVersion).
- **Variáveis de ambiente:** DATABASE_URL (ou DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME), PORT, VITE_TRPC_URL. Ver .env.example e BASE_DE_DADOS.md.
- **Testes:** test:core exige MySQL rodando; cobre estoque nunca negativo, rollback de transação, formato do diagnóstico.

---

## 11. O que o GPT deve entregar no roadmap

1. **Visão geral** do projeto (1 parágrafo) com base neste briefing.  
2. **Fases** (ex.: Fase 1 – Estabilidade/UX, Fase 2 – Funcionalidades, Fase 3 – Escala/Qualidade) com objetivos claros.  
3. **Itens por fase** (tarefas ou temas), priorizados, com dependências quando fizer sentido.  
4. **Respeito** às regras e riscos acima (sem sugerir db:push em prod, sem quebrar convenções de CRUD/auth/estoque).  
5. **Menção** aos docs e scripts existentes (TESTE_RAPIDO, botões .bat, WORKFLOW_GIT) como parte do processo de entrega.  
6. **Cronograma sugerido** (opcional): curto/médio/longo prazo em semanas ou meses, conforme a complexidade.

---

*Fim do briefing. Use este texto completo como contexto para montar o roadmap.*
