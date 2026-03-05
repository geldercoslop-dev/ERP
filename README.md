# GRS – Sistema de Gestão e Finanças

Sistema profissional de gestão de vendas, pedidos, cargas, vendedores e financeiro. Frontend em React (Vite) e backend em Node.js (Express + tRPC), com banco MySQL.

---

## Stack tecnológica

- **Frontend:** React 19, Vite, Tailwind CSS, tRPC + React Query
- **Backend:** Node.js, Express, tRPC, Drizzle ORM
- **Banco:** MySQL (XAMPP ou servidor MySQL)
- **Autenticação:** Sessão por cookie + token (login local com vendedores)

---

## Como rodar localmente

### Pré-requisitos

- **Node.js** (LTS recomendado) – [nodejs.org](https://nodejs.org)
- **MySQL** rodando (porta 3306) – XAMPP ou instalação standalone
- **npm** ou **pnpm** (vem com Node)

### Passos

1. **Clonar ou baixar o projeto** na pasta desejada.

2. **Instalar dependências:**
   ```bash
   npm install
   ```

3. **Configurar ambiente:**  
   Copie `.env.example` para `.env` e preencha (banco, porta, etc.).  
   Ver [docs/BASE_DE_DADOS.md](docs/BASE_DE_DADOS.md) para detalhes.

4. **Criar o banco** no MySQL (ex.: `vendas_app`) e usuário com permissão.

5. **Testar conexão** (rodar um comando por vez):
   ```
   npm run check:db
   ```

6. **Sincronizar o schema (desenvolvimento):**
   ```
   npm run db:push:dev
   ```
   Ou, se usar migrações: `npm run db:migrate`

7. **Subir o servidor:**
   ```
   npm run dev
   ```

8. **Abrir no navegador** a URL indicada no terminal (ex.: `http://localhost:3003`).

9. **Conferir saúde:** Abra `http://localhost:3003/api/health` e verifique `db.status: "ok"` e `schemaMatch: true`.

---

## Comandos principais

| Comando | Uso |
|--------|-----|
| `npm run dev` | Inicia o servidor em modo desenvolvimento |
| `npm run build` | Gera build de produção (front + back) |
| `npm run start` | Inicia o servidor em produção (após build) |
| `npm run check:db` | Testa conexão com o MySQL e lista tabelas |
| `npm run db:push:dev` | Sincroniza schema do código com o banco (só em DEV) |
| `npm run db:push:prod` | **Não executa** – lembra de usar migrations em produção |
| `npm run db:generate` | Gera arquivos de migração |
| `npm run db:migrate` | Aplica migrações pendentes no banco |
| `npm run check` | Verifica TypeScript (tsc --noEmit) |

---

## Documentação (pasta /docs)

| Arquivo | Conteúdo |
|---------|----------|
| [BASE_DE_DADOS.md](docs/BASE_DE_DADOS.md) | Configuração MySQL/XAMPP, .env, comandos db, política DEV vs PROD |
| [RECUPERACAO_SISTEMA.md](docs/RECUPERACAO_SISTEMA.md) | Roteiro de emergência (MySQL, sessão, db:push, migrations, logs) |
| [DEPLOY_PRODUCAO.md](docs/DEPLOY_PRODUCAO.md) | Backup, migrations, healthcheck, smoke test, rollback |
| [CONVENCOES_DE_CODIGO.md](docs/CONVENCOES_DE_CODIGO.md) | Regras para novas telas, CRUD, login e erros SQL |
| [WORKFLOW_DESENVOLVIMENTO.md](docs/WORKFLOW_DESENVOLVIMENTO.md) | Fluxo de trabalho com Git (começar o dia, commits, recuperação) |
| [TESTE_RAPIDO.md](docs/TESTE_RAPIDO.md) | Checklist de smoke test (login, CRUD vendedores, listas, health) |
| [RISCO_ATUAL.md](docs/RISCO_ATUAL.md) | Riscos do sistema e como mitigar |
| [RELATORIO_HARDENING.md](docs/RELATORIO_HARDENING.md) | Relatório da blindagem do sistema (para não programadores) |
| [RELATORIO_HARDENING_FINAL.md](docs/RELATORIO_HARDENING_FINAL.md) | Relatório consolidado hardening + workflow (comandos e checklist) |
| [RELATORIO_CONSOLIDACAO_FINAL.md](docs/RELATORIO_CONSOLIDACAO_FINAL.md) | Relatório desta consolidação (arquivos alterados, comandos, resultado esperado) |
| [BACKUP_BANCO_DEV.md](docs/BACKUP_BANCO_DEV.md) | Como fazer backup do banco em desenvolvimento |
| [REGRAS_PARA_IA.md](docs/REGRAS_PARA_IA.md) | Regras para assistentes de código (Cursor/IA) |
| [STATUS_PROJETO.md](docs/STATUS_PROJETO.md) | Checklist de projeto saudável |
| [RELATORIO_GIT_GITHUB.md](docs/RELATORIO_GIT_GITHUB.md) | Configuração Git + GitHub e como trabalhar sem ZIP (para iniciantes) |
| [WORKFLOW_GIT.md](docs/WORKFLOW_GIT.md) | Branches (dev/main) e regra de commit pequeno |
| [LEMBRETE_COMMIT.md](docs/LEMBRETE_COMMIT.md) | **Lembrete:** quando fazer commit e comandos (git checkout dev, add, commit, push) |
| [RELATORIO_ERRO_ZERO.md](docs/RELATORIO_ERRO_ZERO.md) | Pacote ERRO ZERO: transações, estoque nunca negativo, auditoria, diagnóstico, testes e botões .bat |

---

## Fluxo de desenvolvimento

- **Branch `main`:** produção estável; só recebe código já testado.
- **Branch `dev`:** desenvolvimento atual; commits do dia a dia.
- Trabalhe em `dev`, teste localmente, faça commit e push. Quando estável, integre em `main` (merge ou pull request).
- **Nunca** trabalhe sem commit recente; em caso de quebra, siga [RECUPERACAO_SISTEMA.md](docs/RECUPERACAO_SISTEMA.md).

---

## Política DEV vs PROD

- **Desenvolvimento:** pode usar `npm run db:push:dev` para alinhar o banco ao código rapidamente.
- **Produção:** **nunca** use `db:push`. Use migrations (`db:generate` → revisar SQL → `db:migrate`) e sempre faça **backup** antes de alterar o schema. Ver [DEPLOY_PRODUCAO.md](docs/DEPLOY_PRODUCAO.md).

---

## Contato / suporte interno

Para dúvidas sobre o projeto, uso do Git ou recuperação de erros, consulte primeiro a pasta **/docs**. O sistema foi endurecido (hardening) e possui manual interno permanente; a maior parte das respostas está nos arquivos listados acima.
