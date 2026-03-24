# RelatÃ³rio final â€“ Pacote ERRO ZERO (Financeiro + Estoque + Pedidos)

Resumo do que foi implementado, como usar e o que enviar se algo quebrar.

---

## 1. Lista exata de arquivos alterados/criados

| Caminho | AÃ§Ã£o |
|---------|------|
| `drizzle/schema.ts` | Adicionada tabela `audit_log` (id, createdAt, actorUserId, actorVendedorId, action, entity, entityId, payloadJson, traceId) |
| `server/db.ts` | Criada tabela `audit_log` em ensureSchema; funÃ§Ã£o `insertAuditLog`; funÃ§Ã£o `runDiagnosticoConsistencia`; "estoque nunca negativo" em `updateEstoqueProduto` e `ajusteRapidoEstoque`; `baixarPedidoDireto` envolvido em transaÃ§Ã£o; `atualizarCaixaMensal` aceita `tx` opcional |
| `server/routers.ts` | Erro ESTOQUE_NEGATIVO convertido para TRPCError BAD_REQUEST em `atualizarEstoque`; router `diagnostico.run` (admin); auditoria em vendedores create/update/delete e em pedido create (createVenda) |
| `client/src/pages/Diagnostico.tsx` | SeÃ§Ã£o "ConsistÃªncia do banco" com botÃ£o "Rodar verificaÃ§Ã£o" e lista de problemas; uso de `trpc.diagnostico.run.useQuery` |
| `client/src/App.tsx` | Rota `/diagnostico` protegida (ProtectedShell + AdminOnly) |
| `client/src/config/menuConfig.ts` | Item "DiagnÃ³stico" no menu (admin), href `/diagnostico` |
| `server/tests/run-core-tests.ts` | **Criado** â€“ testes de integraÃ§Ã£o: baixa estoque (impedir negativo), updateEstoqueProduto negativo, runDiagnosticoConsistencia |
| `package.json` | Script `test:core` adicionado |
| `scripts/BOTAO_1_INICIAR_DEV.bat` | **Criado** â€“ inicia dev e abre navegador |
| `scripts/BOTAO_2_TESTAR_SAUDE.bat` | **Criado** â€“ test:db, check:db, GET /api/health |
| `scripts/BOTAO_3_BACKUP_DB_DEV.bat` | **Criado** â€“ backup mysqldump ou instruÃ§Ãµes phpMyAdmin |
| `scripts/BOTAO_4_COMMIT_PUSH.bat` | **Criado** â€“ git add, commit (com prompt de mensagem), push |
| `docs/TESTE_RAPIDO.md` | Tabela dos botÃµes .bat e quando usar |
| `docs/RELATORIO_ERRO_ZERO.md` | **Criado** â€“ este relatÃ³rio |

---

## 2. Tabelas/colunas novas e por quÃª

- **audit_log**  
  - **Por quÃª:** Registrar quem fez o quÃª (create/update/delete em vendedor, pedido, etc.) sem guardar senha nem dados sensÃ­veis.  
  - **Colunas:** id, createdAt, actorUserId, actorVendedorId, action (create|update|delete), entity (vendedor|pedido|â€¦), entityId, payloadJson (resumo), traceId.  
  - A tabela Ã© criada automaticamente no `ensureSchema` ao subir o servidor (nÃ£o exige migraÃ§Ã£o manual se o banco jÃ¡ estiver rodando).

---

## 3. OperaÃ§Ãµes que agora sÃ£o transacionais

- **Baixa de pedido (entrega direta):** `baixarPedidoDireto` â€“ atualizaÃ§Ã£o do pedido, exclusÃ£o/inserÃ§Ã£o de contas a receber, atualizaÃ§Ã£o do caixa mensal e inserÃ§Ã£o de comissÃ£o passam a rodar dentro de uma Ãºnica transaÃ§Ã£o. Ou tudo Ã© aplicado, ou nada Ã©.

- **CriaÃ§Ã£o de pedido com itens:** O fluxo principal de criaÃ§Ã£o de pedido (createVenda no router) jÃ¡ utilizava transaÃ§Ã£o; mantido.

- **Nota de entrada:** `criarNotaEntrada` jÃ¡ utilizava transaÃ§Ã£o; mantido.

- **EdiÃ§Ã£o de pedido:** `updatePedido` jÃ¡ utilizava transaÃ§Ã£o; mantido.

---

## 4. Como funciona o â€œestoque nunca negativoâ€

- **Regra:** Nenhuma operaÃ§Ã£o pode deixar o estoque do produto negativo.
- **Onde estÃ¡:**
  - **`updateEstoqueProduto(id, quantidade)`** â€“ Se `quantidade` for negativa (baixa), o cÃ³digo lÃª o saldo atual, calcula `atual + quantidade`. Se o resultado for &lt; 0, lanÃ§a erro com `code: "ESTOQUE_NEGATIVO"` e mensagem clara (produto, saldo atual, tentativa de baixa).
  - **`ajusteRapidoEstoque(produtoId, quantidade, "saida")`** â€“ Antes de debitar, verifica se o saldo atual Ã© &gt;= quantidade. Se nÃ£o for, lanÃ§a o mesmo tipo de erro.
- **Na API (tRPC):** O procedimento `produtos.atualizarEstoque` trata esse erro e repassa como **TRPCError BAD_REQUEST** com a mesma mensagem, para a UI exibir direto para o usuÃ¡rio.
- **CriaÃ§Ã£o de pedido:** O fluxo de criaÃ§Ã£o de pedido com itens de catÃ¡logo jÃ¡ valida estoque dentro da transaÃ§Ã£o e bloqueia a venda com BAD_REQUEST se nÃ£o houver saldo (mantido como estava).

---

## 5. Como usar a tela DiagnÃ³stico

- **Quem acessa:** Apenas usuÃ¡rio **admin** (rota protegida + menu sÃ³ para admin).
- **Onde:** Menu **RelatÃ³rios â†’ DiagnÃ³stico** ou URL `/diagnostico`.
- **O que fazer:** Clicar em **â€œRodar verificaÃ§Ã£oâ€**. O sistema consulta o banco e mostra uma lista de problemas, por exemplo:
  - Pedidos sem itens  
  - Itens de pedido sem produto vÃ¡lido  
  - PendÃªncias com pedido ou produto inexistente  
  - Produtos com estoque negativo  
  - Pedidos cuja soma dos itens nÃ£o bate com o total  
- Se nÃ£o houver problemas, aparece: **â€œNenhum problema encontrado.â€**

---

## 6. Como rodar os testes (comandos)

Requer MySQL rodando (mesmo ambiente de dev). Na pasta do projeto:

```
npm run test:db
```

(Confirmar que a conexÃ£o estÃ¡ OK.)

```
npm run test:core
```

**Resultado esperado:** mensagem `[test:core] Todos os testes passaram.` e saÃ­da com cÃ³digo 0.  
Se der falha, o script escreve no console o que falhou (por exemplo, esperava erro ESTOQUE_NEGATIVO ou falha em `runDiagnosticoConsistencia`).

---

## 7. Como usar os botÃµes .bat

Ficam na pasta **`scripts/`**. Podem ser executados por duplo clique ou pela linha de comando a partir da raiz do projeto.

| BotÃ£o | Uso |
|--------|-----|
| **BOTAO_1_INICIAR_DEV.bat** | Iniciar o dia: sobe o servidor (npm run dev) e abre o navegador. Use com XAMPP/MySQL jÃ¡ ligado. |
| **BOTAO_2_TESTAR_SAUDE.bat** | Ver se estÃ¡ tudo certo: roda `test:db`, `check:db` e tenta acessar `/api/health`. Use apÃ³s mudar algo no banco ou no servidor. |
| **BOTAO_3_BACKUP_DB_DEV.bat** | Fazer backup do banco de dev (mysqldump, ou instruÃ§Ãµes para phpMyAdmin se o comando nÃ£o estiver no PATH). Use antes de alterar schema ou dados sensÃ­veis. |
| **BOTAO_4_COMMIT_PUSH.bat** | Pedir mensagem de commit, fazer `git add .`, `git commit -m "..."` e `git push`. Use apÃ³s cada entrega (tela pronta, bug resolvido, alteraÃ§Ã£o de banco). |

---

## 8. O que enviar se algo quebrar (para quem te ajuda)

Envie sempre que possÃ­vel:

1. **err.code** â€“ linha do log do servidor com `MySQL err.code:`
2. **err.sqlMessage** â€“ linha com `MySQL err.sqlMessage:`
3. **traceId** â€“ se existir, a linha `[TRPC onError] traceId: XXXXX`
4. **Print ou JSON do /api/health** â€“ resposta completa de `GET http://localhost:3000/api/health` (status do banco, schemaMatch, etc.)
5. **Trecho do log da request /api/trpc que falhou** â€“ mÃ©todo, URL, cookie e as linhas de erro (traceId, err.code, err.sqlMessage)

Com isso fica possÃ­vel localizar o problema no servidor e no banco sem adivinhar.

---

## 9. Riscos e detecÃ§Ã£o rÃ¡pida

- **MySQL desligado:** `npm run test:db` e `npm run check:db` falham (ECONNREFUSED ou similar). **DetecÃ§Ã£o:** rodar os dois; se falharem, ligar XAMPP/MySQL e tentar de novo.
- **Schema desatualizado:** `/api/health` pode mostrar `schemaMatch: false` e as queries podem dar TRPCError. **DetecÃ§Ã£o:** abrir `/api/health`; se `schemaMatch` for false, seguir docs/BASE_DE_DADOS.md e RECUPERACAO_SISTEMA.md (migrations ou db:push:dev em dev).
- **Estoque negativo jÃ¡ existente no banco:** O diagnÃ³stico (tela DiagnÃ³stico) lista â€œestoque_negativoâ€. As regras â€œestoque nunca negativoâ€ impedem **novas** operaÃ§Ãµes de deixar o saldo negativo; nÃ£o corrigem dados jÃ¡ gravados.

Nenhuma alteraÃ§Ã£o foi feita para â€œcaixa 2â€, ocultaÃ§Ã£o ou remoÃ§Ã£o de trilha; foram adicionadas trilha (audit_log) e validaÃ§Ãµes (estoque e consistÃªncia).
