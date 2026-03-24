# Teste rÃ¡pido â€“ rodar e saber se estÃ¡ OK

Checklist operacional com comandos exatos (um por linha). Use apÃ³s mudanÃ§as ou antes de voltar a mexer no layout.

---

## BotÃµes â€œ1 cliqueâ€ (pasta scripts/)

| Arquivo | Uso |
|---------|-----|
| **BOTAO_1_INICIAR_DEV.bat** | Liga o ambiente: inicia `npm run dev` e abre o navegador. Use para comeÃ§ar o dia. |
| **BOTAO_2_TESTAR_SAUDE.bat** | Roda `npm run test:db`, `npm run check:db` e tenta `GET /api/health`. Use para validar que DB e servidor estÃ£o OK. |
| **BOTAO_3_BACKUP_DB_DEV.bat** | Tenta backup via mysqldump; se nÃ£o tiver no PATH, mostra instruÃ§Ãµes para phpMyAdmin. Use antes de mudar schema. |
| **BOTAO_4_COMMIT_PUSH.bat** | Pede mensagem, executa `git add .`, `git commit -m "..."`, `git push`. Use apÃ³s cada entrega (tela/bug/banco). |
| **BOTAO_RODAR_TESTES_CORE.bat** | Roda `npm run test:core` (estoque nunca negativo, rollback de transaÃ§Ã£o, diagnÃ³stico). Use apÃ³s mudanÃ§as em estoque/financeiro. |

Execute os .bat pela pasta do projeto ou pela pasta `scripts/` (eles fazem `cd` para a raiz).

---

## 1. PrÃ©-requisito

- XAMPP/MySQL **ligado** (porta 3306).

---

## 2. Comandos (rodar na pasta do projeto, um por vez)

```bash
npm run test:db
```

**Resultado esperado:** conexÃ£o OK (sem ECONNREFUSED).

```bash
npm run check:db
```

**Resultado esperado:** "ConexÃ£o estabelecida" e lista de tabelas.

```bash
npm run dev
```

**Resultado esperado:** servidor sobe e mostra a URL (ex.: http://localhost:3000). Deixe rodando.

---

## 3. No navegador

1. Abrir a URL que apareceu no terminal (ex.: http://localhost:3000).
2. **Login admin** â†’ deve redirecionar para a aplicaÃ§Ã£o (nÃ£o voltar ao login).
3. **CRUD vendedores:** listar â†’ criar (nome, cidade, senha 6 dÃ­gitos) â†’ confirmar que a **lista atualiza** sem F5 â†’ editar um â†’ excluir um â†’ lista atualiza de novo.
4. Abrir as telas **Pedidos**, **Cargas**, **PendÃªncias** (sÃ³ abrir; as listas disparam e nÃ£o devem dar TRPCError na tela).

---

## 4. Healthcheck

Abrir no navegador (ajuste a porta se for outra):

```
http://localhost:3000/api/health
```

**Confirmar:**

- `db.status` = `"ok"`
- `schemaMatch` = `true`

Se `db.status` for `"error"` ou `schemaMatch` for `false`, corrigir antes de seguir (ver docs/RECUPERACAO_SISTEMA.md e docs/BASE_DE_DADOS.md).

---

## 5. ValidaÃ§Ã£o apÃ³s mudanÃ§as em Estoque / Financeiro

Depois de alterar cÃ³digo de pedidos, estoque, caixa, contas a receber ou transaÃ§Ãµes:

1. Rodar **BOTAO_2_TESTAR_SAUDE.bat** (ou `npm run test:db` + `npm run check:db` + abrir `/api/health`).
2. Rodar **BOTAO_RODAR_TESTES_CORE.bat** (ou `npm run test:core`).
   - Resultado esperado: "Todos os testes passaram" (bloqueio de estoque negativo, rollback de transaÃ§Ã£o, formato do diagnÃ³stico).
3. No navegador: login â†’ criar/editar pedido â†’ baixar pedido â†’ conferir que listas atualizam e que nÃ£o aparece estoque negativo.
4. Se houver tela **DiagnÃ³stico** (admin): clicar em "Rodar verificaÃ§Ã£o" e conferir que a lista de problemas (se houver) mostra tipo, detalhe e sugestÃ£o.

---

## Se falhar â€“ coletar isso e colar no chat

Quando der erro (TRPCError, Failed query, tela em branco, "precisa estar logado"), junte e envie:

1. **err.code** â€“ linha do log do servidor que mostra `MySQL err.code:`
2. **err.sqlMessage** â€“ linha que mostra `MySQL err.sqlMessage:`
3. **traceId** â€“ se existir, a linha `[TRPC onError] traceId: XXXXX`
4. **Print (ou JSON) do /api/health** â€“ resposta completa de `GET /api/health`
5. **Log da request /api/trpc que falhou** â€“ trecho do terminal do servidor com mÃ©todo, url, cookie, x-session-token e a linha de erro (traceId, err.code, err.sqlMessage)

Com isso dÃ¡ para diagnosticar rÃ¡pido sem adivinhar.
