# Auditoria de Segurança Completa — GRS ERP

**Data:** 2026-03  
**Papel:** Arquiteto Sênior + Auditor de Segurança  
**Escopo:** Inventário de todos os routers tRPC, procedures, rotas REST e acessos diretos ao banco.

---

## 1. Rotas REST (Express) — Expostas em `server/_core/index.ts`

| Rota | Método | Protegida? | Observação |
|------|--------|------------|------------|
| `/api/health` | GET | Não | Status do banco, schema, uptime. **OK** (não vaza dados sensíveis). |
| `/api/debug/headers` | GET | Não | Apenas em `NODE_ENV=development`. Eco de headers. **Risco baixo** (só dev). |
| `/api/debug-sentry` | GET | Não | Apenas dispara erro de teste Sentry. **OK**. |
| `/api/backup/download` | GET | **Sim (admin)** | **Corrigido:** protegido por middleware `requireAdmin` (cookie/header); apenas admin pode baixar o ZIP. |
| `/api/oauth/callback` | GET | N/A | Comentada (OAuth desabilitado). |

**Rotas em `server/routes/*` (pedidos, clientes, produtos, promocoes):**  
**Não estão montadas como HTTP.** São importadas apenas dentro de `routers.ts` e chamadas como funções. Ou seja:
- **Nenhuma rota REST** em `routes/pedidos.ts`, `routes/clientes.ts`, etc., está exposta diretamente.
- Uso atual: `pedidosRoutes.createPedido` é chamado por `pedidos.create` (tRPC) — dados **mock in-memory**; o fluxo real de criação é `createVenda` (DB).  
- **Recomendação:** remover ou descontinuar chamadas a mocks (ex.: `pedidos.create` que usa mock) para evitar confusão; ou documentar que `pedidos.create` é legado e não persiste no DB.

---

## 2. Inventário tRPC — Por router e procedure

Legenda:
- **admin-only:** só `adminProcedure` (role admin).
- **vendedor-scoped:** `protectedProcedure` com filtro por `ctx.user` / vendedor.
- **ownership:** getById/update/delete verificam se o recurso pertence ao vendedor (ou admin).
- **vendedorId forçável:** input aceita `vendedorId`? (deve ser **não** para vendedor).
- **tenantId:** não existe no schema atual; isolamento é por **vendedorId**.

---

### auth
| Procedure | Tipo | Filtro/Ownership | Observação |
|-----------|------|------------------|------------|
| me | publicProcedure | — | Retorna user se `ctx.user` existir. Cookie/header definem user. |
| sessionInfo | publicProcedure | — | Retorna user + session (origem do token). Não vaza token. |
| login | publicProcedure | — | Login; define cookie. OK. |
| logout | publicProcedure | — | Limpa cookies. OK. |

---

### vendedores
| Procedure | Tipo | Filtro/Ownership | vendedorId forçável? |
|-----------|------|------------------|----------------------|
| list | adminProcedure | — | N/A |
| create | adminProcedure | — | N/A (admin define dados). |
| update | adminProcedure | — | N/A |
| delete | adminProcedure | — | N/A |

---

### produtos
| Procedure | Tipo | Filtro/Ownership | Observação |
|-----------|------|------------------|------------|
| list | protectedProcedure | Nenhum (catálogo global) | Estoque/produtos são globais; alteração é admin. **OK**. |
| getById | protectedProcedure | Nenhum | **OK** (dado não sensível por vendedor). |
| create | adminProcedure | — | OK. |
| update | adminProcedure | — | OK. |
| delete | adminProcedure | — | OK. |
| buscar | protectedProcedure | Nenhum | Retorna produtos; OK. |
| atualizarEstoque | adminProcedure | — | OK. |
| estoqueBaixo | protectedProcedure | Nenhum | Lista global; OK. |

---

### promocoes
| Procedure | Tipo | Filtro/Ownership |
|-----------|------|------------------|
| list | protectedProcedure | Nenhum (global) |
| detalhes | protectedProcedure | Nenhum |
| create | adminProcedure | — |
| update | adminProcedure | — |
| delete | adminProcedure | — |

**Observação:** Promoções usam `promocoesRoutes.*` (mock). Se não houver tabela real, dados são in-memory. Confirmar se há persistência em DB.

---

### notasEntrada
| Procedure | Tipo |
|-----------|------|
| create | adminProcedure |

---

### cores
| Procedure | Tipo |
|-----------|------|
| list | protectedProcedure (global) |
| create | adminProcedure |
| update | adminProcedure |
| delete | adminProcedure |

---

### gruposPrecificacao
| Procedure | Tipo |
|-----------|------|
| list | protectedProcedure (global) |
| create | adminProcedure |
| update | adminProcedure |
| delete | adminProcedure |

---

### ajusteEstoque
| Procedure | Tipo |
|-----------|------|
| rapido | adminProcedure |

---

### clientes
| Procedure | Tipo | Filtro | getById | update/delete | vendedorId forçável? |
|-----------|------|--------|--------|----------------|----------------------|
| list | protectedProcedure | Vendedor: `listClientesByVendedor` (clientes com pedido do vendedor). Admin: todos. | N/A (não tem getById) | update: ownership por `clienteTemPedidoDoVendedor`. delete: admin-only. | create não aceita; update não usa input.vendedorId. **OK**. |

---

### pedidos
| Procedure | Tipo | Filtro | getById/update/delete | vendedorId forçável? |
|-----------|------|--------|------------------------|----------------------|
| list | protectedProcedure | Vendedor: `vendedorId = ctx`. Admin: todos. | — | N/A |
| getById | protectedProcedure | — | Ownership: vendedor vê só o próprio. | N/A |
| getItens | protectedProcedure | — | Ownership por pedido. | N/A |
| create | protectedProcedure | — | **Usa pedidosRoutes.createPedido (mock).** Não persiste no DB real. Fluxo real: `createVenda`. | Mock não tem vendedorId. |
| update | protectedProcedure | — | Ownership verificado (pedido.vendedorId). | Input não tem vendedorId. **OK**. |
| delete | protectedProcedure | — | Ownership. | N/A |
| buscar | protectedProcedure | Mesmo filtro de list (vendedor). | — | **OK**. |
| updateStatus | protectedProcedure | — | Ownership. | N/A |
| gerarPDF | protectedProcedure | — | Ownership. | N/A |
| marcarEntregue | protectedProcedure | — | Ownership. | N/A |
| createVenda | protectedProcedure | — | vendedorId definido no servidor por `getVendedorFromContext`. | **Não aceita no input. OK.** |

---

### cargas
| Procedure | Tipo |
|-----------|------|
| list | adminProcedure |
| getById | adminProcedure |
| create | adminProcedure |
| updatePedidos | adminProcedure |
| fechar | adminProcedure |
| gerarRomaneioPDF | adminProcedure |
| baixarPedido | adminProcedure |
| finalizar | adminProcedure |

---

### pendencias
| Procedure | Tipo |
|-----------|------|
| list | adminProcedure |
| updateStatus | adminProcedure |

---

### boletos
| Procedure | Tipo | Filtro/Ownership |
|-----------|------|------------------|
| list | protectedProcedure | Admin: todos. Vendedor: `getBoletosByVendedor`. |
| baixarParcial | adminProcedure | — |
| gerarPDF | protectedProcedure | Ownership (boleto.vendedorId). |
| gerarExtrato | protectedProcedure | Vendedor: só se cliente tem boleto do vendedor; PDF filtrado por vendedorId. |
| gerarBoletosCarga | protectedProcedure | Vendedor: todos os pedidos da carga devem ser do vendedor. |
| gerarZip | protectedProcedure | Ownership de cada boleto. |
| gerarRelatorio | protectedProcedure | **Sem filtro por vendedor** — gera PDF financeiro (PAGAR/RECEBER). Roadmap indicou relatórios como admin-only; **recomendação:** tornar `gerarRelatorio` adminProcedure. |

---

### contasReceber
| Procedure | Tipo | Filtro/Ownership | vendedorId forçável? |
|-----------|------|------------------|----------------------|
| list | protectedProcedure | Admin: todas. Vendedor: `getContasReceberByVendedor`. | N/A |
| create | protectedProcedure | vendedorId só do ctx; payload montado sem input.vendedorId. | **Não. OK.** |
| marcarRecebida | protectedProcedure | Ownership (conta.vendedorId). | N/A |
| delete | protectedProcedure | Ownership. | N/A |

---

### caixaMensal
| Procedure | Tipo | Observação |
|-----------|------|------------|
| get | protectedProcedure | Dados globais (caixa por mês). Financeiro. **Recomendação:** admin-only se for sensível. |
| listAll | protectedProcedure | Lista todos os meses. **Recomendação:** admin-only. |

---

### planoContas
| Procedure | Tipo |
|-----------|------|
| list | protectedProcedure (global) |
| create | adminProcedure |
| update | adminProcedure |
| delete | adminProcedure |

---

### contasPagar
| Procedure | Tipo | Observação |
|-----------|------|------------|
| list | protectedProcedure | **Dados globais.** Roadmap: "financeiro completo" = admin-only. **Risco:** vendedor vê todas as contas a pagar. **Recomendação:** adminProcedure. |
| create | protectedProcedure | Idem. |
| pagar | protectedProcedure | Idem. |
| delete | protectedProcedure | Idem. |

---

### contasFixas
| Procedure | Tipo | Observação |
|-----------|------|------------|
| list | protectedProcedure | Global. **Recomendação:** admin-only (financeiro). |
| create | protectedProcedure | Idem. |
| gerarMes | protectedProcedure | Idem. |

---

### comissoes
| Procedure | Tipo | Filtro |
|-----------|------|--------|
| list | protectedProcedure | Admin: todas. Vendedor: `getComissoesByVendedor`. **OK**. |
| marcarPaga | adminProcedure | — |

---

### config
| Procedure | Tipo |
|-----------|------|
| get | protectedProcedure (qualquer usuário logado) |
| set | adminProcedure |

---

### diagnostico
| Procedure | Tipo |
|-----------|------|
| run | adminProcedure |

---

### system (systemRouter)
| Procedure | Tipo | Observação |
|-----------|------|------------|
| (health, schema, etc.) | Variado | Ver `server/_core/systemRouter.ts`. |

---

## 3. Queries diretas ao banco

- **server/db.ts:** Todas as funções de acesso a dados (getDb, select, insert, update, delete) são usadas apenas pelo servidor (routers, pdf, backup). Não há exposição direta ao cliente.
- **server/pdf.ts:** Usa `db.getDb()` e tabelas para gerar PDFs; chamado apenas por procedures tRPC já protegidos.

---

## 4. Resumo de vulnerabilidades e correções

| # | Severidade | Descrição | Correção |
|---|------------|-----------|----------|
| 1 | **CRÍTICA** | `/api/backup/download` sem autenticação — dump completo do banco. | **Corrigido:** middleware `requireAdmin` em `server/_core/requireAdmin.ts`; rota exige admin. |
| 2 | Média | `contasPagar` (list, create, pagar, delete) e `contasFixas` acessíveis a qualquer usuário logado; roadmap define financeiro como admin-only. | Considerar trocar para adminProcedure. |
| 3 | Média | `caixaMensal.get` e `listAll` — dados financeiros globais. | Considerar admin-only. |
| 4 | Baixa | `boletos.gerarRelatorio` — relatório financeiro sem restrição por vendedor. | Considerar adminProcedure. |
| 5 | Informativo | `pedidos.create` usa mock in-memory; não persiste no DB. Fluxo real é `createVenda`. | Documentar ou descontinuar chamada ao mock. |

---

## 5. Proteção por middleware

- **tRPC:** Todas as rotas passam por `createContext`. Procedures são `publicProcedure`, `protectedProcedure` ou `adminProcedure`.
- **protectedProcedure:** exige `ctx.user` (middleware `requireUser`).
- **adminProcedure:** exige `ctx.user.role === 'admin'`.
- **REST:** Apenas `/api/backup/download` é sensível e **não** passa por nenhum middleware de auth.

---

## 6. Uso de tenantId

- **Não existe** no schema. Isolamento é por **vendedorId** em pedidos, contas a receber, boletos, comissões, pendencias.
- Nenhum endpoint aceita `tenantId` no input.

---

## 7. Conclusão da auditoria (Parte 1)

1. **Correção imediata:** Proteger `/api/backup/download` (admin-only ou tRPC).
2. **Ajustes recomendados:** Restringir contasPagar, contasFixas, caixaMensal e gerarRelatorio a admin, conforme roadmap.
3. **Nenhuma rota REST** em `server/routes/*` está exposta como HTTP; uso é apenas via tRPC (e em um caso mock).
4. **RBAC:** Pedidos, clientes, contas a receber, boletos estão com filtro/ownership para vendedor; input não permite forçar `vendedorId` nos fluxos críticos já auditados na Fase 1.
