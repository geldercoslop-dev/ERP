# Relatório ERRO ZERO: Núcleo Financeiro + Estoque

Resumo em linguagem simples do que foi alterado e como validar.

---

## O que foi alterado (arquivos)

| Caminho | Alteração |
|---------|-----------|
| `server/db.ts` | Tipo `AuditAction` com ENTRADA/SAIDA/AJUSTE/BAIXA; `insertAuditLog` aceita `tx` opcional para uso em transação; `updateEstoqueProduto` e `ajusteRapidoEstoque` registram movimentação em `audit_log` (saldoAnterior, saldoNovo, motivo, traceId); `runDiagnosticoConsistencia` retorna `tipoProblema`, `entidade`, `id`, `detalhe`, `sugestao` e inclui verificação de **contas a receber órfãs**; `criarNotaEntrada` grava auditoria de estoque por item (ENTRADA) dentro da transação. |
| `server/routers.ts` | `atualizarEstoque` chama `db.updateEstoqueProduto` direto com auditoria (actorUserId/actorVendedorId, traceId); erro `ESTOQUE_NEGATIVO`/`ESTOQUE_INSUFICIENTE` → TRPCError BAD_REQUEST; após `baixarPedidoDireto` sucesso → `insertAuditLog` action BAIXA, entity pedido. |
| `server/routes/produtos.ts` | Resposta 400 com mensagem clara quando `e.code === 'ESTOQUE_NEGATIVO'` ou `ESTOQUE_INSUFICIENTE`. |
| `client/src/pages/Diagnostico.tsx` | Interface com `tipoProblema`, `entidade`, `detalhe`, `sugestao`; lista de problemas exibe detalhe e sugestão por item; texto atualizado (contas órfãs). |
| `server/tests/run-core-tests.ts` | Validação do formato do diagnóstico (tipoProblema, entidade, detalhe, sugestao); **teste de rollback**: transação que atualiza estoque e lança erro → confere que estoque não foi alterado. |
| `scripts/BOTAO_RODAR_TESTES_CORE.bat` | Novo script: roda `npm run test:core`. |
| `docs/TESTE_RAPIDO.md` | Inclusão do botão BOTAO_RODAR_TESTES_CORE e seção **"Validação após mudanças em Estoque / Financeiro"**. |

---

## Tabelas/colunas novas

- Nenhuma tabela nova. A tabela `audit_log` já existia; apenas passamos a usá-la com `action` ENTRADA, SAIDA, AJUSTE, BAIXA e `entity` estoque/pedido/contas_receber etc.

---

## Invariantes garantidas agora

1. **Estoque:** `produto.estoque >= 0` — toda saída/baixa valida saldo; se resultar negativo, lança erro com código `ESTOQUE_NEGATIVO` e mensagem clara.
2. **Movimentação de estoque:** Toda alteração (updateEstoqueProduto, ajusteRapidoEstoque, nota de entrada) gera registro em `audit_log` com tipo (ENTRADA/SAIDA), quantidade, saldoAnterior, saldoNovo, motivo, actor e traceId.
3. **Financeiro/Pedidos:** createVenda e baixarPedidoDireto já rodavam em transação; baixa de pedido passa a ser auditada (action BAIXA, entity pedido).
4. **Pedidos:** Diagnóstico verifica pedidos sem itens, itens sem produto, totais inconsistentes, **contas a receber órfãs** (pedido inexistente ou cancelado).
5. **Transação:** Teste automático confirma que, em caso de erro no meio da transação, nada é gravado (rollback).

---

## Como reproduzir e testar

1. **Branch e ambiente**
   - `git checkout dev`
   - MySQL/XAMPP ligado (porta 3306).

2. **Comandos (um por linha)**
   ```bash
   npm run check
   npm run test:db
   npm run check:db
   npm run test:core
   npm run dev
   ```
   - **check:** sem erros TypeScript.
   - **test:db / check:db:** conexão OK.
   - **test:core:** todos os testes passam (bloqueio estoque negativo, rollback, formato diagnóstico).
   - **dev:** sobe o app; seguir **TESTE_RAPIDO.md** no navegador (login, CRUD vendedores, pedidos, Diagnóstico “Rodar verificação”).

3. **Validação manual**
   - Tela **Diagnóstico** (admin): botão “Rodar verificação” → lista com tipoProblema, detalhe e sugestão (e contas órfãs se houver).
   - Tentar dar saída de estoque maior que o saldo → deve aparecer toast/mensagem “Estoque insuficiente” (sem stacktrace).

---

## Se falhar – o que coletar

- **err.code** e **err.sqlMessage** (log do servidor).
- **traceId** (se aparecer no log ou na resposta).
- Print ou JSON de **GET /api/health** (db.status, schemaMatch).
- Log da requisição **/api/trpc** que falhou (método, cookie, traceId, err.code, err.sqlMessage).

Enviar isso no chat facilita o diagnóstico.

---

## Próximo risco mais provável e como evitar

- **Risco:** Alterar schema (novas colunas/tabelas) sem migração versionada ou sem rodar `test:core` após mudanças em estoque/financeiro.
- **Evitar:** Sempre que mexer em pedidos, estoque, caixa ou contas: rodar **BOTAO_RODAR_TESTES_CORE.bat** (ou `npm run test:core`) e seguir a seção “Validação após mudanças em Estoque / Financeiro” do **TESTE_RAPIDO.md**. Em produção, não usar `db:push`; usar migrações e backup.

---

## Comandos sugeridos ao final (para você rodar)

```bash
git checkout dev
npm run check
npm run test:db
npm run check:db
npm run test:core
npm run dev
```

Depois, no navegador: fluxo do **TESTE_RAPIDO.md** (login, CRUD, health, Diagnóstico). Se tudo estiver verde:

```bash
git add .
git commit -m "ERRO ZERO: núcleo financeiro+estoque (invariantes, auditoria, diagnóstico, testes)"
git push
```
