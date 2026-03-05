# Teste rápido – rodar e saber se está OK

Checklist operacional com comandos exatos (um por linha). Use após mudanças ou antes de voltar a mexer no layout.

---

## Botões “1 clique” (pasta scripts/)

| Arquivo | Uso |
|---------|-----|
| **BOTAO_1_INICIAR_DEV.bat** | Liga o ambiente: inicia `npm run dev` e abre o navegador. Use para começar o dia. |
| **BOTAO_2_TESTAR_SAUDE.bat** | Roda `npm run test:db`, `npm run check:db` e tenta `GET /api/health`. Use para validar que DB e servidor estão OK. |
| **BOTAO_3_BACKUP_DB_DEV.bat** | Tenta backup via mysqldump; se não tiver no PATH, mostra instruções para phpMyAdmin. Use antes de mudar schema. |
| **BOTAO_4_COMMIT_PUSH.bat** | Pede mensagem, executa `git add .`, `git commit -m "..."`, `git push`. Use após cada entrega (tela/bug/banco). |
| **BOTAO_RODAR_TESTES_CORE.bat** | Roda `npm run test:core` (estoque nunca negativo, rollback de transação, diagnóstico). Use após mudanças em estoque/financeiro. |

Execute os .bat pela pasta do projeto ou pela pasta `scripts/` (eles fazem `cd` para a raiz).

---

## 1. Pré-requisito

- XAMPP/MySQL **ligado** (porta 3306).

---

## 2. Comandos (rodar na pasta do projeto, um por vez)

```bash
npm run test:db
```

**Resultado esperado:** conexão OK (sem ECONNREFUSED).

```bash
npm run check:db
```

**Resultado esperado:** "Conexão estabelecida" e lista de tabelas.

```bash
npm run dev
```

**Resultado esperado:** servidor sobe e mostra a URL (ex.: http://localhost:3003). Deixe rodando.

---

## 3. No navegador

1. Abrir a URL que apareceu no terminal (ex.: http://localhost:3003).
2. **Login admin** → deve redirecionar para a aplicação (não voltar ao login).
3. **CRUD vendedores:** listar → criar (nome, cidade, senha 6 dígitos) → confirmar que a **lista atualiza** sem F5 → editar um → excluir um → lista atualiza de novo.
4. Abrir as telas **Pedidos**, **Cargas**, **Pendências** (só abrir; as listas disparam e não devem dar TRPCError na tela).

---

## 4. Healthcheck

Abrir no navegador (ajuste a porta se for outra):

```
http://localhost:3003/api/health
```

**Confirmar:**

- `db.status` = `"ok"`
- `schemaMatch` = `true`

Se `db.status` for `"error"` ou `schemaMatch` for `false`, corrigir antes de seguir (ver docs/RECUPERACAO_SISTEMA.md e docs/BASE_DE_DADOS.md).

---

## 5. Validação após mudanças em Estoque / Financeiro

Depois de alterar código de pedidos, estoque, caixa, contas a receber ou transações:

1. Rodar **BOTAO_2_TESTAR_SAUDE.bat** (ou `npm run test:db` + `npm run check:db` + abrir `/api/health`).
2. Rodar **BOTAO_RODAR_TESTES_CORE.bat** (ou `npm run test:core`).
   - Resultado esperado: "Todos os testes passaram" (bloqueio de estoque negativo, rollback de transação, formato do diagnóstico).
3. No navegador: login → criar/editar pedido → baixar pedido → conferir que listas atualizam e que não aparece estoque negativo.
4. Se houver tela **Diagnóstico** (admin): clicar em "Rodar verificação" e conferir que a lista de problemas (se houver) mostra tipo, detalhe e sugestão.

---

## Se falhar – coletar isso e colar no chat

Quando der erro (TRPCError, Failed query, tela em branco, "precisa estar logado"), junte e envie:

1. **err.code** – linha do log do servidor que mostra `MySQL err.code:`
2. **err.sqlMessage** – linha que mostra `MySQL err.sqlMessage:`
3. **traceId** – se existir, a linha `[TRPC onError] traceId: XXXXX`
4. **Print (ou JSON) do /api/health** – resposta completa de `GET /api/health`
5. **Log da request /api/trpc que falhou** – trecho do terminal do servidor com método, url, cookie, x-session-token e a linha de erro (traceId, err.code, err.sqlMessage)

Com isso dá para diagnosticar rápido sem adivinhar.
