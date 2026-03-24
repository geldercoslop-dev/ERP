# GRS â€“ Sistema de GestÃ£o e FinanÃ§as

Sistema profissional de gestÃ£o de vendas, pedidos, cargas, vendedores e financeiro. Frontend em React (Vite) e backend em Node.js (Express + tRPC), com banco MySQL.

---

## Stack tecnolÃ³gica

- **Frontend:** React 19, Vite, Tailwind CSS, tRPC + React Query
- **Backend:** Node.js, Express, tRPC, Drizzle ORM
- **Banco:** MySQL (XAMPP ou servidor MySQL)
- **AutenticaÃ§Ã£o:** SessÃ£o por cookie + token (login local com vendedores)

---

## Como rodar localmente

### PrÃ©-requisitos

- **Node.js** (LTS recomendado) â€“ [nodejs.org](https://nodejs.org)
- **MySQL** rodando (porta 3306) â€“ XAMPP ou instalaÃ§Ã£o standalone
- **npm** ou **pnpm** (vem com Node)

### Passos

1. **Clonar ou baixar o projeto** na pasta desejada.

2. **Instalar dependÃªncias:**
   ```bash
   npm install
   ```

3. **Configurar ambiente:**  
   Copie `.env.example` para `.env` e preencha (banco, porta, etc.).  
   Ver [docs/BASE_DE_DADOS.md](docs/BASE_DE_DADOS.md) para detalhes.

4. **Criar o banco** no MySQL (ex.: `vendas_app`) e usuÃ¡rio com permissÃ£o.

5. **Testar conexÃ£o** (rodar um comando por vez):
   ```
   npm run check:db
   ```

6. **Sincronizar o schema (desenvolvimento):**
   ```
   npm run db:push:dev
   ```
   Ou, se usar migraÃ§Ãµes: `npm run db:migrate`

7. **Subir o servidor:**
   ```
   npm run dev
   ```

8. **Abrir no navegador** a URL indicada no terminal (ex.: `http://localhost:3000`).

9. **Conferir saÃºde:** Abra `http://localhost:3000/api/health` e verifique `db.status: "ok"` e `schemaMatch: true`.

---

## Comandos principais

| Comando | Uso |
|--------|-----|
| `npm run dev` | Inicia o servidor em modo desenvolvimento |
| `npm run build` | Gera build de produÃ§Ã£o (front + back) |
| `npm run start` | Inicia o servidor em produÃ§Ã£o (apÃ³s build) |
| `npm run check:db` | Testa conexÃ£o com o MySQL e lista tabelas |
| `npm run db:push:dev` | Sincroniza schema do cÃ³digo com o banco (sÃ³ em DEV) |
| `npm run db:push:prod` | **NÃ£o executa** â€“ lembra de usar migrations em produÃ§Ã£o |
| `npm run db:generate` | Gera arquivos de migraÃ§Ã£o |
| `npm run db:migrate` | Aplica migraÃ§Ãµes pendentes no banco |
| `npm run check` | Verifica TypeScript (tsc --noEmit) |

---

## DocumentaÃ§Ã£o (pasta /docs)

| Arquivo | ConteÃºdo |
|---------|----------|
| [BASE_DE_DADOS.md](docs/BASE_DE_DADOS.md) | ConfiguraÃ§Ã£o MySQL/XAMPP, .env, comandos db, polÃ­tica DEV vs PROD |
| [RECUPERACAO_SISTEMA.md](docs/RECUPERACAO_SISTEMA.md) | Roteiro de emergÃªncia (MySQL, sessÃ£o, db:push, migrations, logs) |
| [DEPLOY_PRODUCAO.md](docs/DEPLOY_PRODUCAO.md) | Backup, migrations, healthcheck, smoke test, rollback |
| [CONVENCOES_DE_CODIGO.md](docs/CONVENCOES_DE_CODIGO.md) | Regras para novas telas, CRUD, login e erros SQL |
| [WORKFLOW_DESENVOLVIMENTO.md](docs/WORKFLOW_DESENVOLVIMENTO.md) | Fluxo de trabalho com Git (comeÃ§ar o dia, commits, recuperaÃ§Ã£o) |
| [TESTE_RAPIDO.md](docs/TESTE_RAPIDO.md) | Checklist de smoke test (login, CRUD vendedores, listas, health) |
| [RISCO_ATUAL.md](docs/RISCO_ATUAL.md) | Riscos do sistema e como mitigar |
| [RELATORIO_HARDENING.md](docs/RELATORIO_HARDENING.md) | RelatÃ³rio da blindagem do sistema (para nÃ£o programadores) |
| [RELATORIO_HARDENING_FINAL.md](docs/RELATORIO_HARDENING_FINAL.md) | RelatÃ³rio consolidado hardening + workflow (comandos e checklist) |
| [RELATORIO_CONSOLIDACAO_FINAL.md](docs/RELATORIO_CONSOLIDACAO_FINAL.md) | RelatÃ³rio desta consolidaÃ§Ã£o (arquivos alterados, comandos, resultado esperado) |
| [BACKUP_BANCO_DEV.md](docs/BACKUP_BANCO_DEV.md) | Como fazer backup do banco em desenvolvimento |
| [REGRAS_PARA_IA.md](docs/REGRAS_PARA_IA.md) | Regras para assistentes de cÃ³digo (Cursor/IA) |
| [STATUS_PROJETO.md](docs/STATUS_PROJETO.md) | Checklist de projeto saudÃ¡vel |
| [RELATORIO_GIT_GITHUB.md](docs/RELATORIO_GIT_GITHUB.md) | ConfiguraÃ§Ã£o Git + GitHub e como trabalhar sem ZIP (para iniciantes) |
| [WORKFLOW_GIT.md](docs/WORKFLOW_GIT.md) | Branches (dev/main) e regra de commit pequeno |
| [LEMBRETE_COMMIT.md](docs/LEMBRETE_COMMIT.md) | **Lembrete:** quando fazer commit e comandos (git checkout dev, add, commit, push) |
| [RELATORIO_ERRO_ZERO.md](docs/RELATORIO_ERRO_ZERO.md) | Pacote ERRO ZERO: transaÃ§Ãµes, estoque nunca negativo, auditoria, diagnÃ³stico, testes e botÃµes .bat |

---

## Fluxo de desenvolvimento

- **Branch `main`:** produÃ§Ã£o estÃ¡vel; sÃ³ recebe cÃ³digo jÃ¡ testado.
- **Branch `dev`:** desenvolvimento atual; commits do dia a dia.
- Trabalhe em `dev`, teste localmente, faÃ§a commit e push. Quando estÃ¡vel, integre em `main` (merge ou pull request).
- **Nunca** trabalhe sem commit recente; em caso de quebra, siga [RECUPERACAO_SISTEMA.md](docs/RECUPERACAO_SISTEMA.md).

---

## PolÃ­tica DEV vs PROD

- **Desenvolvimento:** pode usar `npm run db:push:dev` para alinhar o banco ao cÃ³digo rapidamente.
- **ProduÃ§Ã£o:** **nunca** use `db:push`. Use migrations (`db:generate` â†’ revisar SQL â†’ `db:migrate`) e sempre faÃ§a **backup** antes de alterar o schema. Ver [DEPLOY_PRODUCAO.md](docs/DEPLOY_PRODUCAO.md).

---

## Contato / suporte interno

Para dÃºvidas sobre o projeto, uso do Git ou recuperaÃ§Ã£o de erros, consulte primeiro a pasta **/docs**. O sistema foi endurecido (hardening) e possui manual interno permanente; a maior parte das respostas estÃ¡ nos arquivos listados acima.
