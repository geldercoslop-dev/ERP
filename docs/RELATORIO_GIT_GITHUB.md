# Relatório – Configuração Git + GitHub (fluxo profissional)

Este relatório explica, em linguagem simples, o que foi feito para o projeto passar a usar Git e GitHub como um projeto profissional, sem depender de ZIP. Serve para quem nunca usou Git ou quer um guia rápido.

---

## 1. Git já estava configurado ou foi inicializado?

O projeto **não tinha** repositório Git antes. Foi preparada toda a estrutura para você inicializar quando o Git estiver instalado:

- **Arquivo .gitignore** foi criado na raiz do projeto. Ele diz ao Git quais pastas e arquivos **não** devem ser versionados (node_modules, dist, .env, logs, etc.), para não subir segredos nem arquivos pesados.
- **Comandos para você rodar** (quando o Git estiver instalado na sua máquina):
  1. Abra o terminal na pasta do projeto (ex.: `c:\GRS ATUAL`).
  2. `git init` – isso cria o repositório Git (pasta .git).
  3. `git checkout -b dev` – cria a branch `dev` e já muda para ela (você passa a trabalhar em `dev`).
  4. O branch padrão costuma ser `main`; ele já existe após o `git init`. A `main` fica para produção estável; a `dev` para o dia a dia.

Se em outro computador o Git já estiver instalado e você clonar o projeto do GitHub, não precisará rodar `git init` de novo; só `git checkout dev` (ou a branch que a equipe usar).

---

## 2. Estrutura de branches criada

O **padrão** definido na documentação é:

- **main** – produção estável. Só recebe código já testado (merge da `dev` ou por pull request).
- **dev** – desenvolvimento atual. É onde você faz commits no dia a dia, testa e depois integra na `main`.

Na prática: você trabalha em `dev`, faz `git add`, `git commit`, `git push`. Quando tudo estiver estável, alguém (ou você) faz o merge de `dev` em `main`. Assim a `main` nunca fica quebrada por acidente.

---

## 3. Arquivos de documentação adicionados

Foram criados ou atualizados estes arquivos:

| Arquivo | O que contém |
|---------|----------------|
| **README.md** (raiz) | Descrição do sistema, stack, como rodar, pré-requisitos, comandos principais, links para /docs, fluxo de desenvolvimento, política DEV vs PROD, contato/suporte. |
| **.gitignore** (raiz) | Lista do que o Git deve ignorar (node_modules, dist, .env, logs, etc.). |
| **docs/WORKFLOW_DESENVOLVIMENTO.md** | Como começar o dia, fazer mudanças seguras, salvar progresso (commit/push), recuperar trabalho, o que fazer se quebrar, regra de nunca trabalhar sem commit recente. |
| **docs/BACKUP_BANCO_DEV.md** | Passo a passo: backup do banco via phpMyAdmin e via mysqldump, quando fazer, onde guardar. |
| **docs/REGRAS_PARA_IA.md** | Regras para Cursor/IA: não remover funcionalidades, não operações destrutivas no banco, não alterar .env sem avisar, respeitar DEV vs PROD e /docs. |
| **docs/STATUS_PROJETO.md** | Checklist de projeto saudável (servidor roda, MySQL conecta, /api/health OK, login, CRUD vendedores, listas atualizam, sem TRPCError crítico, sem erro fatal no console). |
| **docs/RELATORIO_GIT_GITHUB.md** | Este relatório. |

Nenhuma funcionalidade do sistema foi alterada; só estrutura de versionamento, backup e workflow.

---

## 4. Como subir o projeto para o GitHub

1. **Crie uma conta** no [GitHub](https://github.com) (se ainda não tiver).
2. **Crie um repositório novo** no GitHub: botão “New repository”, nome (ex.: `grs-vendas`), pode ser privado. **Não** marque “Initialize with README” se o projeto já tiver README na sua pasta.
3. **Na pasta do projeto** (com Git já inicializado e pelo menos um commit):
   - Adicione os arquivos: `git add .`
   - Primeiro commit: `git commit -m "Configuracao inicial: projeto com hardening e docs"`
   - Conecte ao GitHub (troque `SEU_USUARIO` e `grs-vendas` pelo seu usuário e nome do repo):
     ```bash
     git remote add origin https://github.com/SEU_USUARIO/grs-vendas.git
     ```
   - Envie a branch `main`: `git push -u origin main`
   - Envie a branch `dev`: `git push -u origin dev`
4. A partir daí, sempre que fizer `git push` na branch em que estiver, o código sobe para o GitHub e fica salvo na nuvem.

---

## 5. Passo a passo para quem nunca usou Git

- **O que é o Git?** Um sistema que guarda “fotos” (commits) do seu projeto. Cada commit tem uma mensagem e um ID. Você pode voltar a qualquer “foto” e trabalhar a partir dela. Não precisa mais enviar ZIP; o código fica no seu PC e, com `git push`, numa cópia no GitHub.
- **Passo a passo resumido:**
  1. Instale o Git: [git-scm.com](https://git-scm.com) (Windows) ou pelo gerenciador de pacotes no Linux/Mac.
  2. Abra o terminal na pasta do projeto.
  3. `git init` – cria o repositório.
  4. `git checkout -b dev` – cria e entra na branch `dev`.
  5. `git add .` – marca todos os arquivos para entrar no próximo commit (respeitando o .gitignore).
  6. `git commit -m "Minha primeira mensagem"` – cria o primeiro “foto” do projeto.
  7. Depois de criar o repositório no GitHub e adicionar o `remote` (ver item 4 acima): `git push -u origin dev`.
  8. No dia a dia: edite o código → `git add .` → `git commit -m "O que voce fez"` → `git push`. Assim você “salva” no GitHub e não perde trabalho.

Para mais detalhes do dia a dia (começar o dia, recuperar trabalho, o que fazer se quebrar), use **docs/WORKFLOW_DESENVOLVIMENTO.md**.

---

## 6. Como trabalhar sem ZIP daqui para frente

- **Código:** Todo o código fica versionado no Git. Você trabalha na pasta do projeto, faz commit e push. Para compartilhar ou usar em outro PC, você **clona** o repositório do GitHub (`git clone URL_DO_REPO`) ou faz **pull** (`git pull`) na pasta já clonada. Não é mais necessário enviar o projeto inteiro em ZIP.
- **Banco:** O banco MySQL **não** vai para o Git (são dados). Para backup do banco, use o guia **docs/BACKUP_BANCO_DEV.md** (phpMyAdmin ou mysqldump) e guarde o arquivo .sql em pasta local ou em nuvem (Google Drive, OneDrive, etc.), **sem** commitar no Git se tiver dados sensíveis.
- **Configuração (.env):** Não é versionada (está no .gitignore). Em outra máquina, copie o .env à mão a partir do .env.example ou de um backup seguro. Nunca suba .env com senhas no GitHub.

Resumo: código = Git + GitHub; banco = backup manual (docs); .env = cópia manual em cada máquina.

---

## 7. Riscos restantes (se houver)

- **Git não instalado:** No ambiente em que foi feita a configuração, o Git não estava no PATH. Você precisa instalar o Git e rodar `git init` e `git checkout -b dev` na pasta do projeto. O resto (README, .gitignore, docs) já está pronto.
- **Perda do .env:** Se você perder a máquina e não tiver cópia do .env, precisará refazer a configuração (banco, porta, etc.) a partir do .env.example. Por isso é bom guardar uma cópia segura do .env em lugar que não seja o repositório.
- **Banco:** Se o disco quebrar e não houver backup do MySQL, os dados do banco se perdem. Por isso o **docs/BACKUP_BANCO_DEV.md** existe: faça backup periódico do banco em desenvolvimento também.

---

## 8. O que fazer em caso de perda de máquina

1. **Código:** Em outro computador, instale o Git, clone o repositório do GitHub (`git clone URL_DO_REPO`), entre na pasta, rode `npm install`, e restaure o .env (cópia que você guardou ou refaça a partir do .env.example).
2. **Banco:** Se você tiver um backup .sql (phpMyAdmin ou mysqldump), instale o MySQL (ou XAMPP), crie o banco e o usuário, e importe o backup (ver **docs/BACKUP_BANCO_DEV.md**).
3. Depois: `npm run check:db`, `npm run db:push:dev` ou `npm run db:migrate` (conforme sua política), `npm run dev`, e confira **docs/TESTE_RAPIDO.md** e **docs/STATUS_PROJETO.md**.

Assim você recupera projeto e banco em outra máquina sem depender de ZIP.

---

## 9. Como restaurar projeto e banco em outro computador

1. Instale Node.js, MySQL (ou XAMPP) e Git.
2. Clone o projeto: `git clone https://github.com/SEU_USUARIO/NOME_DO_REPO.git` e entre na pasta.
3. `npm install`
4. Copie o .env (ou crie a partir de .env.example) e preencha DATABASE_URL ou DB_* e PORT.
5. Crie o banco no MySQL e o usuário (ver **docs/BASE_DE_DADOS.md**).
6. Se tiver backup do banco: importe o .sql (phpMyAdmin ou `mysql -u ... -p ... < backup.sql`). Se não tiver: rode `npm run db:push:dev` para criar as tabelas (só em dev).
7. `npm run check:db` – deve dar “Conexão estabelecida”.
8. `npm run dev` e abra a URL no navegador. Confira **GET /api/health** e o checklist em **docs/TESTE_RAPIDO.md**.

O projeto estará restaurado e pronto para trabalho profissional, sem ZIP.
