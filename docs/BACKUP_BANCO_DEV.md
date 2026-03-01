# Backup do banco em desenvolvimento

Como fazer cópia de segurança do banco MySQL usado no dia a dia (desenvolvimento), para não perder dados e poder restaurar se algo der errado.

---

## Quando fazer backup

- **Antes de** rodar `db:push:dev` ou `db:migrate` se você não tiver certeza do resultado.
- **Antes de** testar alterações grandes no schema ou em dados.
- **Periodicamente** (ex.: fim do dia ou fim da semana), se os dados de dev forem importantes.
- **Antes de** atualizar o MySQL ou o XAMPP.

---

## Onde guardar o arquivo

- **Pasta do projeto:** por exemplo `backups/` na raiz (e adicione `backups/` ao `.gitignore` para não versionar dumps).
- **Ou** em uma pasta fora do projeto (ex.: Documentos/BackupsGRS) com nome que indique data, ex.: `vendas_app_2026-03-01.sql`.

**Importante:** não commitar arquivos `.sql` de backup que contenham dados reais no Git; use apenas `.gitignore` ou repositório privado com cuidado.

---

## 1. Backup via phpMyAdmin

1. Abra o phpMyAdmin (via XAMPP: http://localhost/phpmyadmin).
2. No menu à esquerda, clique no nome do banco (ex.: `vendas_app`).
3. Clique na aba **Exportar** (ou **Export**).
4. Método: **Rápido** (só estrutura e dados da base selecionada) ou **Personalizado** (para escolher tabelas).
5. Formato: **SQL**.
6. Clique em **Executar** / **Go**.
7. O navegador vai baixar um arquivo `.sql`. Guarde-o na pasta escolhida e renomeie com a data se quiser (ex.: `vendas_app_2026-03-01.sql`).

**Restaurar:** no phpMyAdmin, selecione o banco (ou crie um novo), aba **Importar** (**Import**), escolha o arquivo `.sql` e execute.

---

## 2. Backup via mysqldump (linha de comando)

No terminal (cmd ou PowerShell), com o MySQL no PATH ou acessando a pasta do MySQL:

```bash
mysqldump -u USUARIO -p NOME_DO_BANCO > caminho/do/backup.sql
```

Exemplo (usuário `vendas`, banco `vendas_app`, arquivo na pasta do projeto):

```bash
mysqldump -u vendas -p vendas_app > backups/vendas_app_2026-03-01.sql
```

O comando vai pedir a senha do usuário MySQL. O arquivo `vendas_app_2026-03-01.sql` conterá a estrutura e os dados.

**Restaurar:**

```bash
mysql -u vendas -p vendas_app < caminho/do/backup.sql
```

Ou no MySQL:

```sql
USE vendas_app;
SOURCE caminho/do/backup.sql;
```

---

## Resumo

| Método        | Quando usar              | Onde guardar                    |
|---------------|--------------------------|---------------------------------|
| phpMyAdmin    | Interface gráfica, rápido| Pasta local (ex.: backups/)     |
| mysqldump    | Script, automação         | Mesmo; não versionar no Git    |

Sempre que for fazer mudança arriscada no banco (push, migração, teste de script), faça um backup antes.
