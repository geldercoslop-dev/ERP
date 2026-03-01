# Regras para IA (Cursor e outros assistentes de código)

Estas regras devem ser seguidas quando a IA modificar código ou sugerir comandos neste projeto. O projeto já passou por hardening e possui documentação em /docs; não alterar funcionalidades nem regras de negócio.

---

## Ao modificar código

- **NÃO** remover funcionalidades existentes sem solicitação explícita do usuário.
- **NÃO** executar operações destrutivas no banco (DROP TABLE, TRUNCATE, DELETE em massa) sem solicitação explícita e sem que o usuário tenha feito backup.
- **NÃO** alterar arquivos `.env` ou variáveis de ambiente sem avisar o usuário (e sem commitar .env com segredos).
- **SEMPRE** respeitar as políticas DEV vs PROD documentadas em [BASE_DE_DADOS.md](BASE_DE_DADOS.md) e [DEPLOY_PRODUCAO.md](DEPLOY_PRODUCAO.md): em produção, nunca sugerir `db:push`; usar migrations e backup.
- **SEMPRE** manter compatibilidade com a documentação em /docs: se uma convenção ou fluxo estiver documentado (ex.: invalidateAfterMutation, isSubmitting local, uso de traceId), o código deve seguir ou a doc deve ser atualizada em conjunto.
- **NÃO** desabilitar ou remover logs de diagnóstico (err.code, err.sqlMessage, traceId) sem justificativa e aviso.
- Ao criar novas telas ou CRUDs, seguir [CONVENCOES_DE_CODIGO.md](CONVENCOES_DE_CODIGO.md) (validação local, isSubmitting, toast, invalidar lista após mutation, não usar loading global para botões).

---

## Resumo

- Não remover funcionalidades.
- Não operações destrutivas no banco sem aviso e backup.
- Não alterar .env sem avisar.
- Sempre respeitar DEV vs PROD e /docs.
- Manter compatibilidade com convenções e documentação.
