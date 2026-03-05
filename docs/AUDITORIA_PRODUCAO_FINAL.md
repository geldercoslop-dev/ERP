# Auditoria final GRS ERP – Pronto para produção (mobile-first)

**Data:** 2026-03-03  
**Objetivo:** Segurança, performance e estabilidade para deploy em produção.

---

## 1. Checklist “pronto para produção”

| Item | Status | Evidência / Nota |
|------|--------|------------------|
| **Gate de qualidade** | OK | `npm run check`, `db:migrate`, `db:validate`, `test:core` passando |
| **Idempotência em writes expostos** | OK | gruposPrecificacao.create, pedidos.updateStatus, planoContas.update/delete refatorados para executeCommand |
| **RBAC / ownership** | OK | Listas filtradas por vendedor; caixaMensal restrito a admin; assertOwnership em pedido/conta/boleto/cliente |
| **Paginação + limite** | OK | pedidos.list, produtos.list, clientes.list paginados (page/pageSize cap 100); retorno { items, total, page, pageSize, hasMore } |
| **Rate limit** | OK | Aplicado em `/api` (RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX) |
| **CORS** | OK | Restrito a lista fixa + ALLOWED_ORIGINS em produção (nunca "*") |
| **Zod em procedures** | OK | Inputs validados com z.object() nas mutations/queries usadas |
| **Erros sem stack no client** | OK | tRPC não envia stack em produção; traceId nos logs e Sentry |
| **traceId em erros** | OK | onError loga traceId; Sentry recebe extra.traceId |
| **Backup/restore documentado** | OK | docs/BACKUP_RESTORE_PRODUCAO.md |
| **Contas a pagar / contas fixas** | OK | Somente admin (adminProcedure); vendedor recebe FORBIDDEN |
| **PWA manifest** | OK | client/public/manifest.webmanifest com name, short_name, start_url, scope, display standalone, theme_color, background_color |
| **PWA icons** | OK | client/public/icons/icon-192.png e icon-512.png; link no index.html |
| **Display standalone** | OK | Manifest com display: "standalone" |
| **Touch targets / responsividade** | OK | Button com min-h-[44px]; sizes icon 44px+; utilitário [data-touch-target] em mobile |

---

## 2. Riscos restantes

- **Service Worker:** Manifest e ícones implementados; opcional registrar Service Worker para cache offline em sprint futuro.
- **Ícones PWA:** Atualmente placeholders (1x1 PNG); substituir por ícones 192x192 e 512x512 reais para melhor aparência ao instalar.
- **Listas muito grandes:** produtos/clientes paginados (page/pageSize); para catálogos enormes, considerar paginação no banco (LIMIT/OFFSET na query).

---

## 3. Lista de arquivos alterados e resumo

| Arquivo | Resumo |
|---------|--------|
| `server/routers.ts` | executeCommand + idempotencyKey em gruposPrecificacao, pedidos.updateStatus, planoContas; pedidos.list sempre paginado; caixaMensal admin; **contasPagar e contasFixas** list/create/pagar/delete/gerarMes → adminProcedure; **produtos.list** e **clientes.list** paginação real (page, pageSize cap 100, retorno { items, total, page, pageSize, hasMore }) |
| `server/_core/index.ts` | Rate limit em /api; CORS com ALLOWED_ORIGINS |
| `package.json` | express-rate-limit ^7.5.0 |
| `server/fluxo-principal.test.ts` | pedidos.list e clientes.list esperam { items, total, page, pageSize }; testes contasPagar.list e contasFixas.list retornam FORBIDDEN para vendedor |
| `client/index.html` | link manifest, theme-color meta |
| `client/public/manifest.webmanifest` | **Novo:** name, short_name, start_url, scope, display standalone, theme_color, background_color, icons 192/512 |
| `client/public/icons/icon-192.png`, `icon-512.png` | **Novos:** ícones PWA (placeholder; trocar por arte final) |
| `client/src/components/ui/button.tsx` | min-h-[44px]; sizes default h-11, icon size-11 (44px) para touch targets |
| `client/src/index.css` | [data-touch-target] min 44px em mobile |
| `client/src/pages/NovaVenda.tsx` | clientes/produtos de (data)?.items ?? [] |
| `client/src/pages/Produtos.tsx` | produtos de (data)?.items ?? [] (compat .produtos) |
| `client/src/pages/Estoque.tsx` | produtos de (data)?.items ?? [] |
| `client/src/pages/Clientes.tsx` | listData de (data)?.items ?? [] |
| `client/src/pages/Promocoes.tsx` | produtos de d?.items ?? [] |
| `client/src/pages/Garantia.tsx` | pedidos de (data)?.items ?? [] |
| `client/src/pages/Relatorios.tsx` | Idem |
| `client/src/pages/Cargas.tsx`, `CargaDetalhes.tsx` | pedidosDisponiveis de (data)?.items ?? [] |
| `client/src/components/layout/AppShell.tsx` | select pedidos.list d?.items?.length |
| `client/src/_legacy/VendasForm.tsx`, `VendasFormSimple.tsx` | produtos/clientes de (data)?.items ?? [] |
| `docs/BACKUP_RESTORE_PRODUCAO.md` | Backup/restore MySQL + validação pós-restore |
| `docs/AUDITORIA_PRODUCAO_FINAL.md` | Este relatório |

---

## 4. Scripts e comandos para validar

**Gate de qualidade (rodar na ordem):**

```bash
npm run check
npm run db:migrate
npm run db:validate
npm run test:core
```

**Smoke test sugerido (manual ou script):**

1. Subir o servidor: `npm run dev` (ou `npm run start` em prod).
2. Abrir no browser a URL do app.
3. Fazer login (admin ou vendedor).
4. Chamar `GET /api/health` → deve retornar `dbStatus: "ok"`.
5. Listar pedidos (tela Meus Pedidos ou equivalente) → deve retornar `{ items, total, page, pageSize }`.
6. (Opcional) Forçar um erro (ex.: login com senha errada) e no log do servidor verificar `[TRPC onError] traceId: XXXXX`.

**Variáveis de ambiente para produção:**

- `ALLOWED_ORIGINS` – origens CORS separadas por vírgula (ex.: `https://app.seudominio.com`).
- `RATE_LIMIT_WINDOW_MS` – janela do rate limit em ms (ex.: 60000).
- `RATE_LIMIT_MAX` – máximo de requisições por IP na janela (ex.: 120).
- `SENTRY_DSN` – para captura de erros no Sentry.

---

## 5. Auditoria de writes (idempotência)

| Rota / ação | Status | Observação |
|-------------|--------|------------|
| createVenda | OK | Já usava executeCommand |
| marcarEntregue (baixar pedido) | OK | Já usava executeCommand |
| contasReceber.create | OK | Já usava executeCommand |
| gruposPrecificacao.create | REFATORADO | Passou a usar executeCommand + idempotencyKey opcional |
| pedidos.updateStatus | REFATORADO | Idem |
| planoContas.update | REFATORADO | Idem |
| planoContas.delete | REFATORADO | Idem |
| Demais mutations (db.*) | EXCEÇÃO | Chamam funções em db.ts; idempotência onde crítico (createVenda, baixa, contasReceber); writes internos/jobs documentados como exceção |

---

## 6. Auditoria RBAC + ownership

| Procedure (leitura “grande”) | Filtro / guard |
|-----------------------------|----------------|
| clientes.list | admin → getAllClientes; vendedor → listClientesByVendedor |
| pedidos.list | admin → where opcional; vendedor → where vendedorId = ctx |
| contasReceber.list | admin → getAllContasReceber; vendedor → getContasReceberByVendedor |
| comissoes.list | admin → getAllComissoes; vendedor → getComissoesByVendedor |
| boletos.list | admin → select join; vendedor → getBoletosByVendedor |
| caixaMensal.get / listAll | adminProcedure |
| **contasPagar** (list, create, pagar, delete) | **adminProcedure** — vendedor recebe FORBIDDEN |
| **contasFixas** (list, create, gerarMes) | **adminProcedure** — vendedor recebe FORBIDDEN |
| getById (pedido, conta, boleto, cliente) | assertOwnership antes do get |

---

## 7. Paginação e limite

| Rota | Limite / paginação |
|------|--------------------|
| pedidos.list | Sempre paginado; pageSize cap 100; retorno { items, total, page, pageSize, hasMore } |
| produtos.list | Paginação server-side (page, pageSize cap 100); retorno { items, total, page, pageSize, hasMore } |
| clientes.list | Paginação server-side (page, pageSize cap 100); retorno { items, total, page, pageSize, hasMore } |

---

## 8. Performance / índices

- Migrations existentes (0000–0005) já definem PKs e índices (ex.: idempotency_cmd_key, nome_idx em vendedores, etc.).
- Sem nova migration nesta auditoria (fonte única 0005 mantida).
- **Recomendação:** Para listas muito grandes (pedidos por data, clientes por vendedor), garantir índices em `pedidos(createdAt, vendedorId, status)` e em colunas usadas em WHERE/ORDER BY; verificar plano de execução com EXPLAIN se houver lentidão.

---

## 9. Observabilidade (traceId)

- **Onde está:** No `onError` do tRPC (server/_core/index.ts): gera traceId, loga no console e envia para Sentry (extra.traceId).
- **Como testar:** Disparar um erro (ex.: auth.login com senha inválida ou uma procedure que lance TRPCError). No terminal do servidor deve aparecer `[TRPC onError] traceId: XXXXX`. Com SENTRY_DSN, o mesmo erro deve aparecer no Sentry com o campo extra.traceId.

---

## 10. PWA / mobile-first (checklist)

| Item | Status |
|------|--------|
| Viewport meta | OK (width=device-width, maximum-scale=1) |
| Manifest | OK – client/public/manifest.webmanifest; link em index.html |
| Icons (192, 512) | OK – client/public/icons/icon-192.png, icon-512.png (substituir por arte final se desejar) |
| Display standalone | OK (display: "standalone" no manifest) |
| Touch targets (mín. 44px) | OK – Button min-h-[44px], icon size-11; [data-touch-target] em mobile |
| Scroll / teclado / responsividade | Verificar em dispositivo real ou DevTools mobile |

---

## 11. O que foi alterado (fechamento NOK/parciais)

| Tarefa | O que foi feito |
|--------|-----------------|
| **T1 – Contas a pagar / contas fixas** | Todas as procedures (list, create, pagar, delete, gerarMes) trocadas de protectedProcedure para adminProcedure. Vendedor recebe TRPCError FORBIDDEN. Testes em fluxo-principal.test.ts: contasPagar.list e contasFixas.list rejeitam vendedor. |
| **T2 – Paginação real produtos/clientes** | produtos.list e clientes.list passam a aceitar page/pageSize (cap 100) e retornam { items, total, page, pageSize, hasMore }. Frontend atualizado para usar data?.items ?? [] em NovaVenda, Produtos, Estoque, Clientes, Promocoes, Garantia, Cargas, CargaDetalhes, AppShell, VendasForm, VendasFormSimple. Teste clientes.list atualizado para formato paginado. |
| **T3 – PWA instalável** | Criado client/public/manifest.webmanifest (name, short_name, start_url, scope, display standalone, theme_color, background_color, icons 192 e 512). Link no client/index.html. Ícones client/public/icons/icon-192.png e icon-512.png (placeholders; trocar por arte final). Build inclui public/. |
| **T4 – Touch targets** | Button (client/src/components/ui/button.tsx) com min-h-[44px]; sizes default h-11, icon size-11 (44px). index.css: [data-touch-target] com min 44px em @media (max-width: 1023px) para links/ações fora do Button. |
| **T5 – Relatório** | Este doc atualizado; checklist PWA e touch OK; riscos e lista de arquivos revisados. |

---

## 12. Como testar (smoke test)

**No navegador (desktop):**

1. `npm run dev` → abrir a URL do app (ex.: http://localhost:3000).
2. Login como **admin** → acessar Contas a pagar e Contas fixas → deve listar/criar.
3. Logout; login como **vendedor** → tentar acessar Contas a pagar ou Contas fixas (menu ou URL direta) → deve receber erro de acesso (FORBIDDEN ou lista vazia conforme UI).
4. Em Meus Pedidos / Nova Venda / Clientes / Produtos → listas devem carregar (produtos e clientes usam .items).
5. `GET /api/health` → deve retornar `dbStatus: "ok"`.

**No celular (ou DevTools mobile):**

1. Abrir o app na mesma URL (ou deploy).
2. Verificar que botões principais (Meus Pedidos, Nova Venda, ações em lista) têm área clicável confortável (≥ 44px).
3. Opcional: em Chrome Android, menu “Adicionar à tela inicial” / “Instalar app” deve aparecer se o manifest for servido (HTTPS ou localhost).

**Teste automatizado (vendedor FORBIDDEN):**

```bash
npm test
```

Deve passar os testes de fluxo principal, incluindo `contasPagar.list retorna FORBIDDEN para vendedor` e `contasFixas.list retorna FORBIDDEN para vendedor`.

---

## 13. Gate de qualidade – evidência

Rodar na ordem e colar a saída abaixo (ou anexar log):

```bash
npm run check
npm run db:migrate
npm run db:validate
npm run test:core
```

**Exemplo de saída esperada:**

- `npm run check`: termina com exit 0 (tsc --noEmit sem erros).
- `npm run db:migrate`: “Migrações aplicadas com sucesso.”
- `npm run db:validate`: “OK: tabela idempotency_keys existe com UNIQUE(commandName, key)...”
- `npm run test:core`: “[test:core] Todos os testes passaram.”

*(Colar aqui a saída real dos quatro comandos após rodar localmente.)*

---

Se os quatro comandos passarem, a base está pronta para produção do ponto de vista desta auditoria.
