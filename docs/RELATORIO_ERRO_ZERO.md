# Relatório final – Pacote ERRO ZERO (Financeiro + Estoque + Pedidos)

Resumo do que foi implementado, como usar e o que enviar se algo quebrar.

---

## 1. Lista exata de arquivos alterados/criados

| Caminho | Ação |
|---------|------|
| `drizzle/schema.ts` | Adicionada tabela `audit_log` (id, createdAt, actorUserId, actorVendedorId, action, entity, entityId, payloadJson, traceId) |
| `server/db.ts` | Criada tabela `audit_log` em ensureSchema; função `insertAuditLog`; função `runDiagnosticoConsistencia`; "estoque nunca negativo" em `updateEstoqueProduto` e `ajusteRapidoEstoque`; `baixarPedidoDireto` envolvido em transação; `atualizarCaixaMensal` aceita `tx` opcional |
| `server/routers.ts` | Erro ESTOQUE_NEGATIVO convertido para TRPCError BAD_REQUEST em `atualizarEstoque`; router `diagnostico.run` (admin); auditoria em vendedores create/update/delete e em pedido create (createVenda) |
| `client/src/pages/Diagnostico.tsx` | Seção "Consistência do banco" com botão "Rodar verificação" e lista de problemas; uso de `trpc.diagnostico.run.useQuery` |
| `client/src/App.tsx` | Rota `/diagnostico` protegida (ProtectedShell + AdminOnly) |
| `client/src/config/menuConfig.ts` | Item "Diagnóstico" no menu (admin), href `/diagnostico` |
| `server/tests/run-core-tests.ts` | **Criado** – testes de integração: baixa estoque (impedir negativo), updateEstoqueProduto negativo, runDiagnosticoConsistencia |
| `package.json` | Script `test:core` adicionado |
| `scripts/BOTAO_1_INICIAR_DEV.bat` | **Criado** – inicia dev e abre navegador |
| `scripts/BOTAO_2_TESTAR_SAUDE.bat` | **Criado** – test:db, check:db, GET /api/health |
| `scripts/BOTAO_3_BACKUP_DB_DEV.bat` | **Criado** – backup mysqldump ou instruções phpMyAdmin |
| `scripts/BOTAO_4_COMMIT_PUSH.bat` | **Criado** – git add, commit (com prompt de mensagem), push |
| `docs/TESTE_RAPIDO.md` | Tabela dos botões .bat e quando usar |
| `docs/RELATORIO_ERRO_ZERO.md` | **Criado** – este relatório |

---

## 2. Tabelas/colunas novas e por quê

- **audit_log**  
  - **Por quê:** Registrar quem fez o quê (create/update/delete em vendedor, pedido, etc.) sem guardar senha nem dados sensíveis.  
  - **Colunas:** id, createdAt, actorUserId, actorVendedorId, action (create|update|delete), entity (vendedor|pedido|…), entityId, payloadJson (resumo), traceId.  
  - A tabela é criada automaticamente no `ensureSchema` ao subir o servidor (não exige migração manual se o banco já estiver rodando).

---

## 3. Operações que agora são transacionais

- **Baixa de pedido (entrega direta):** `baixarPedidoDireto` – atualização do pedido, exclusão/inserção de contas a receber, atualização do caixa mensal e inserção de comissão passam a rodar dentro de uma única transação. Ou tudo é aplicado, ou nada é.

- **Criação de pedido com itens:** O fluxo principal de criação de pedido (createVenda no router) já utilizava transação; mantido.

- **Nota de entrada:** `criarNotaEntrada` já utilizava transação; mantido.

- **Edição de pedido:** `updatePedido` já utilizava transação; mantido.

---

## 4. Como funciona o “estoque nunca negativo”

- **Regra:** Nenhuma operação pode deixar o estoque do produto negativo.
- **Onde está:**
  - **`updateEstoqueProduto(id, quantidade)`** – Se `quantidade` for negativa (baixa), o código lê o saldo atual, calcula `atual + quantidade`. Se o resultado for &lt; 0, lança erro com `code: "ESTOQUE_NEGATIVO"` e mensagem clara (produto, saldo atual, tentativa de baixa).
  - **`ajusteRapidoEstoque(produtoId, quantidade, "saida")`** – Antes de debitar, verifica se o saldo atual é &gt;= quantidade. Se não for, lança o mesmo tipo de erro.
- **Na API (tRPC):** O procedimento `produtos.atualizarEstoque` trata esse erro e repassa como **TRPCError BAD_REQUEST** com a mesma mensagem, para a UI exibir direto para o usuário.
- **Criação de pedido:** O fluxo de criação de pedido com itens de catálogo já valida estoque dentro da transação e bloqueia a venda com BAD_REQUEST se não houver saldo (mantido como estava).

---

## 5. Como usar a tela Diagnóstico

- **Quem acessa:** Apenas usuário **admin** (rota protegida + menu só para admin).
- **Onde:** Menu **Relatórios → Diagnóstico** ou URL `/diagnostico`.
- **O que fazer:** Clicar em **“Rodar verificação”**. O sistema consulta o banco e mostra uma lista de problemas, por exemplo:
  - Pedidos sem itens  
  - Itens de pedido sem produto válido  
  - Pendências com pedido ou produto inexistente  
  - Produtos com estoque negativo  
  - Pedidos cuja soma dos itens não bate com o total  
- Se não houver problemas, aparece: **“Nenhum problema encontrado.”**

---

## 6. Como rodar os testes (comandos)

Requer MySQL rodando (mesmo ambiente de dev). Na pasta do projeto:

```
npm run test:db
```

(Confirmar que a conexão está OK.)

```
npm run test:core
```

**Resultado esperado:** mensagem `[test:core] Todos os testes passaram.` e saída com código 0.  
Se der falha, o script escreve no console o que falhou (por exemplo, esperava erro ESTOQUE_NEGATIVO ou falha em `runDiagnosticoConsistencia`).

---

## 7. Como usar os botões .bat

Ficam na pasta **`scripts/`**. Podem ser executados por duplo clique ou pela linha de comando a partir da raiz do projeto.

| Botão | Uso |
|--------|-----|
| **BOTAO_1_INICIAR_DEV.bat** | Iniciar o dia: sobe o servidor (npm run dev) e abre o navegador. Use com XAMPP/MySQL já ligado. |
| **BOTAO_2_TESTAR_SAUDE.bat** | Ver se está tudo certo: roda `test:db`, `check:db` e tenta acessar `/api/health`. Use após mudar algo no banco ou no servidor. |
| **BOTAO_3_BACKUP_DB_DEV.bat** | Fazer backup do banco de dev (mysqldump, ou instruções para phpMyAdmin se o comando não estiver no PATH). Use antes de alterar schema ou dados sensíveis. |
| **BOTAO_4_COMMIT_PUSH.bat** | Pedir mensagem de commit, fazer `git add .`, `git commit -m "..."` e `git push`. Use após cada entrega (tela pronta, bug resolvido, alteração de banco). |

---

## 8. O que enviar se algo quebrar (para quem te ajuda)

Envie sempre que possível:

1. **err.code** – linha do log do servidor com `MySQL err.code:`
2. **err.sqlMessage** – linha com `MySQL err.sqlMessage:`
3. **traceId** – se existir, a linha `[TRPC onError] traceId: XXXXX`
4. **Print ou JSON do /api/health** – resposta completa de `GET http://localhost:3003/api/health` (status do banco, schemaMatch, etc.)
5. **Trecho do log da request /api/trpc que falhou** – método, URL, cookie e as linhas de erro (traceId, err.code, err.sqlMessage)

Com isso fica possível localizar o problema no servidor e no banco sem adivinhar.

---

## 9. Riscos e detecção rápida

- **MySQL desligado:** `npm run test:db` e `npm run check:db` falham (ECONNREFUSED ou similar). **Detecção:** rodar os dois; se falharem, ligar XAMPP/MySQL e tentar de novo.
- **Schema desatualizado:** `/api/health` pode mostrar `schemaMatch: false` e as queries podem dar TRPCError. **Detecção:** abrir `/api/health`; se `schemaMatch` for false, seguir docs/BASE_DE_DADOS.md e RECUPERACAO_SISTEMA.md (migrations ou db:push:dev em dev).
- **Estoque negativo já existente no banco:** O diagnóstico (tela Diagnóstico) lista “estoque_negativo”. As regras “estoque nunca negativo” impedem **novas** operações de deixar o saldo negativo; não corrigem dados já gravados.

Nenhuma alteração foi feita para “caixa 2”, ocultação ou remoção de trilha; foram adicionadas trilha (audit_log) e validações (estoque e consistência).
