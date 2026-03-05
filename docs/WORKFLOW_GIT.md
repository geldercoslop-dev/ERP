# Workflow Git – regras permanentes

Trabalhar sempre no branch **dev**. Commits pequenos. Após cada entrega, rodar os comandos abaixo.

---

## Branches

- **dev** – uso no dia a dia. Trabalhe sempre aqui (telas, bugs, schema).
- **main** – produção estável. Só recebe código já testado (merge a partir de dev). Não commite direto em main.

---

## Regra de commit pequeno

| Quando | Ação |
|--------|------|
| Tela pronta | commit |
| Botão funcionando | commit |
| Banco alterado | commit |
| Bug resolvido | commit |

Não acumule muitas mudanças em um único commit.

---

## Após cada “entrega” (tela / bug / banco)

1. Rodar sempre:

```bash
npm run check
```

**Resultado esperado:** termina sem erro de TypeScript.

2. Se mexeu no banco (schema/tabelas):

```bash
npm run check:db
```

**Resultado esperado:** "Conexão estabelecida".

Depois seguir a política: em **DEV** pode usar `npm run db:push:dev` (com MySQL ligado); em **PROD** nunca db:push, só migrations (ver docs/BASE_DE_DADOS.md).

3. Commitar e enviar (um comando por linha):

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

**Dica:** Cole cada comando em uma linha separada no terminal. Se colar tudo junto sem Enter entre os comandos, pode aparecer erro estranho (ex.: interpretar "git" como "initgit" ou comando inválido). Sempre um comando por vez.

---

## Exemplo de comandos Git (linha por linha)

```bash
git checkout dev
```

```bash
git add .
```

```bash
git commit -m "Tela de vendedores: filtro por cidade"
```

```bash
git push
```

Ver também [LEMBRETE_COMMIT.md](LEMBRETE_COMMIT.md).
