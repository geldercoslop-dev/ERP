# Lembrete – Commit pequeno

**Regra:** Tela pronta → commit. Botão funcionando → commit. Banco alterado → commit. Bug resolvido → commit.

---

## Após cada entrega

1. Rodar `npm run check`.
2. Se mexeu no banco: rodar `npm run check:db` e depois seguir política (dev: db:push:dev ou migrations).
3. Commitar (sempre no branch **dev**). Comandos **um por linha** (não colar tudo junto, senão pode dar erro tipo "initgit" ou comando inválido):

```bash
git checkout dev
```

```bash
git status
```

```bash
git add .
```

```bash
git commit -m "Descrição curta do que foi feito"
```

```bash
git push
```

---

## Exemplos de mensagem

- `Tela de vendedores: filtro por cidade`
- `Corrige lista que não atualizava após criar pedido`
- `Schema: adiciona coluna X na tabela Y`
- `Login: botão Entrar com isSubmitting local`

Ver [WORKFLOW_GIT.md](WORKFLOW_GIT.md) para regras completas.
