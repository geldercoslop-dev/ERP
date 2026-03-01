# Workflow de desenvolvimento

Fluxo de trabalho diario com Git para manter o projeto estavel e recuperavel, sem depender de ZIP.

---

## 1. Como comecar o dia de trabalho

1. Atualizar o codigo (se usar repositorio remoto): `git pull`
2. Instalar dependencias (se alguem tiver adicionado novas): `npm install`
3. Iniciar o MySQL (XAMPP ou servico) na porta 3306
4. Subir o servidor: `npm run dev`
5. Abrir no navegador a URL indicada e conferir GET /api/health (db ok, schemaMatch true)

---

## 2. Como fazer mudancas seguras

1. Editar o codigo na branch `dev`
2. Testar localmente (login, telas alteradas, criar/editar registro)
3. Rodar o checklist em [TESTE_RAPIDO.md](TESTE_RAPIDO.md)
4. So depois: commit e push (secao 3)

---

## 3. Como salvar progresso

1. `git add .`
2. `git commit -m "Descricao curta do que foi feito"`
3. `git push` (ou `git push -u origin dev` na primeira vez na branch)

Assim o progresso fica versionado e nao se perde.

---

## 4. Como recuperar trabalho

- Pegar ultimas alteracoes: `git pull`
- Ver historico: `git log --oneline`
- Voltar arquivos ao estado de um commit: `git checkout <hash> -- .` (cuidado: altera arquivos)
- Desfazer ultimo commit mantendo alteracoes: `git reset --soft HEAD~1`

---

## 5. Como agir se o sistema quebrar

1. Seguir [RECUPERACAO_SISTEMA.md](RECUPERACAO_SISTEMA.md)
2. Conferir GET /api/health (schemaMatch, db.status)
3. Se quiser descartar alteracoes nao commitadas: `git checkout -- .` (use com cuidado)

---

## 6. Regra absoluta

**NUNCA trabalhe sem commit recente.** Faca commit ao final do dia ou ao concluir uma funcionalidade. Use `git push` para nao perder trabalho e nao depender de ZIP.
