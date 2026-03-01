# Checklist – Projeto saudável

Use este checklist para confirmar que o sistema está estável e pronto para uso ou para continuar desenvolvendo. Marque cada item após conferir.

---

## Ambiente e servidor

- [ ] **Servidor roda sem erro** – `npm run dev` (ou `npm run start` em produção) inicia e não cai com erro fatal.
- [ ] **MySQL conecta** – `npm run check:db` termina com "Conexão estabelecida" e lista tabelas.
- [ ] **GET /api/health OK** – Ao abrir `http://localhost:PORTA/api/health`, a resposta tem `db.status: "ok"` e `schemaMatch: true` (ou justificativa documentada se schemaMatch for false em algum ambiente controlado).

---

## Funcionalidades básicas

- [ ] **Login funciona** – É possível fazer login com usuário admin (ou vendedor) e ser redirecionado para a aplicação sem voltar à tela de login.
- [ ] **CRUD vendedores OK** – Listar, criar, editar e excluir vendedor funciona; mensagens de sucesso/erro aparecem; lista atualiza após cada ação sem dar F5.
- [ ] **Listas atualizam** – Após criar/editar/excluir em qualquer tela de lista (vendedores, pedidos, cargas, etc.), a lista reflete a alteração sem recarregar a página (ou o comportamento está documentado como exceção).

---

## Erros e console

- [ ] **Sem TRPCError crítico** – Ao usar as telas principais (login, vendedores, pedidos, cargas), não aparece erro de "Failed query" ou TRPCError que impeça o uso. (Erros esperados, ex.: "Acesso negado" para usuário sem permissão, podem aparecer.)
- [ ] **Sem erro fatal no console** – No console do navegador (F12), não há erro em vermelho que quebre a aplicação ao navegar pelas telas principais.

---

## Quando algo falhar

- Se algum item não estiver ok, seguir [RECUPERACAO_SISTEMA.md](RECUPERACAO_SISTEMA.md) e, se for erro de banco, conferir [RISCO_ATUAL.md](RISCO_ATUAL.md) e [BASE_DE_DADOS.md](BASE_DE_DADOS.md).
- Para teste passo a passo após mudanças: [TESTE_RAPIDO.md](TESTE_RAPIDO.md).
