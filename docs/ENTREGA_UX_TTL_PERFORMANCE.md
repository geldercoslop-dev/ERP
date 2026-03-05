# Entrega — UX inProgress, TTL/limpeza, performance e próximos passos

## 1. Lista de arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `server/_core/command.ts` | Retorno amigável para "em processamento": `{ ok: false, inProgress: true, traceId, message }` em vez de lançar. Tipo `InProgressResponse`. |
| `server/routers.ts` | createVenda, contasReceber.create, marcarEntregue: checam `result.inProgress` e retornam o objeto; removido catch de `IdempotencyInProgressError`. createVenda/marcarEntregue: inProgress checado antes de audit. pedidos.list: input com `page` e `pageSize` opcionais; quando informados, retorno `{ items, total, page, pageSize }`. |
| `client/src/pages/NovaVenda.tsx` | Tratamento de `res.inProgress`: toast "Já está processando, aguarde…", não limpa loading. `idempotencyKeyRef` e envio de `idempotencyKey` no createVenda. |
| `client/src/pages/MeusPedidos.tsx` | onSuccess de marcarEntregue: se `data.inProgress` mostra toast e não fecha o modal. `entregaIdempotencyKeyRef` e `idempotencyKey` no mutate. Debounce 400 ms em `busca` → `buscaDebounced` para a query. `staleTime: 30_000` na list. Normalização: `pedidos = Array.isArray(pedidosRaw) ? pedidosRaw : pedidosRaw?.items ?? []`. |
| `client/src/pages/ContasReceber.tsx` | handleCreate: verifica `res.inProgress`, toast "Processando…"; `createIdempotencyKeyRef` e `idempotencyKey` no create. |
| `docs/IDEMPOTENCY_DB.md` | TTL 7 dias, política para "em processamento" > 15 min (deletar), referência ao script e ao BAT. |
| `scripts/maintenance/cleanup-idempotency.ts` | **Novo.** Remove registros com TTL > 7 dias e "em processamento" > 15 min. |
| `scripts/BOTAO_LIMPAR_IDEMPOTENCY.bat` | **Novo.** Chama o script de limpeza. |
| `docs/NEXT_STEPS_INICIANTE.md` | **Novo.** Passo a passo: MySQL, migrations, npm run check/test:core/dev, teste manual, onde olhar em falhas. |
| `docs/ENTREGA_UX_TTL_PERFORMANCE.md` | **Novo.** Este documento. |

---

## 2. Confirmação: "inProgress" amigável e sem induzir clique repetido

- O servidor **não lança** em "em processamento"; devolve `{ ok: false, inProgress: true, traceId, message: "Em processamento. Aguarde." }`.
- No client (NovaVenda, MeusPedidos, ContasReceber), ao receber `inProgress`: exibe toast "Já está processando, aguarde…" e **mantém** o botão desabilitado (loading continua até resposta final ou erro).
- `idempotencyKey` é enviado nas ações críticas (NovaVenda, marcarEntregue, ContasReceber create), evitando duplicidade e permitindo retorno inProgress no segundo request.

---

## 3. Confirmação: TTL e limpeza

- **TTL:** 7 dias documentado em `docs/IDEMPOTENCY_DB.md`.
- **Script:** `scripts/maintenance/cleanup-idempotency.ts` remove registros com `createdAt` &gt; 7 dias e registros com `resultJson` NULL e `createdAt` &gt; 15 min.
- **BAT:** `scripts/BOTAO_LIMPAR_IDEMPOTENCY.bat` para rodar a limpeza no Windows.
- **Política:** "Em processamento" antigo (&gt; 15 min) é **deletado** para liberar a chave (documentado em IDEMPOTENCY_DB.md).

---

## 4. Confirmação: paginação / debounce / cache

- **pedidos.list:** aceita `page` e `pageSize` opcionais; quando usados, retorna `{ items, total, page, pageSize }`; sem paginação retorna o array (compatível).
- **MeusPedidos:** busca com debounce de 400 ms (`buscaDebounced`); query da lista com `staleTime: 30_000`; resposta da lista normalizada para array (`items` ou array direto).

---

## 5. Resultado do npm run check

- `npm run check` foi executado; o projeto deve seguir passando (sem erros de TypeScript nos arquivos alterados). Em caso de falha, conferir tipos de retorno de `pedidos.list` (array | { items, total, page, pageSize }) nos consumidores.

---

## 6. Instruções no docs/NEXT_STEPS_INICIANTE.md

- **Conteúdo:** como ligar o MySQL (XAMPP), aplicar migrations (0005 e 0006), rodar `npm run check`, `npm run test:core`, `npm run dev`, teste manual (login admin/vendedor, nova venda com duplo clique, rede lenta/“processando”, listas), onde olhar em falhas (traceId, logs, Diagnóstico) e como rodar a limpeza de idempotência.
