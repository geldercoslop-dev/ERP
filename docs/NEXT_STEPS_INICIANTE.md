# Próximos passos — Guia para iniciante

Passo a passo simples para rodar o sistema e fazer testes manuais.

---

## 1) Ligar o MySQL (XAMPP ou outro)

- Abra o XAMPP (ou o serviço MySQL que você usa).
- Inicie o **MySQL**.
- Confirme que a porta é **3306** e que o banco configurado em `.env` existe (ex.: `vendas_app`).

---

## 2) Aplicar as migrations

As migrations ficam na pasta `drizzle/`. Para criar/atualizar as tabelas:

- **0005_idempotency_keys.sql** — cria a tabela de idempotência.
- **0006_idempotency_unique_command_key.sql** — ajusta a constraint para `UNIQUE(commandName, key)`.

**Como aplicar:**  
Execute o conteúdo de cada arquivo `.sql` no seu cliente MySQL (phpMyAdmin, DBeaver, ou linha de comando), **na ordem** (0005 depois 0006).  
Ou use o script de migração do projeto, se houver (ex.: `npm run db:migrate`).

---

## 3) Rodar os comandos

No terminal, na pasta do projeto:

```bash
npm run check
```

Deve terminar sem erros de TypeScript.

```bash
npm run test:core
```

Requer MySQL ligado e migrations aplicadas. Os testes conferem estoque, idempotência e rollback.

```bash
npm run dev
```

Sobe o servidor e o front. Acesse a URL que aparecer no terminal (ex.: `http://localhost:3003`).

---

## 4) Teste manual essencial

1. **Login admin**  
   Faça login com usuário admin. Confirme que o menu e as telas de admin abrem.

2. **Login vendedor**  
   Faça login com um vendedor. Confirme que só aparecem as opções permitidas (ex.: Meus Pedidos, Clientes, Nova Venda).

3. **Nova venda — duplo clique**  
   Em Nova Venda, preencha e clique em “Salvar” **duas vezes seguidas**.  
   - Deve criar **apenas um** pedido.  
   - Deve aparecer algo como “Já está processando, aguarde…” no segundo clique (toast).

4. **Rede lenta / processando**  
   Com as ferramentas do navegador (Network: throttling) ou desligando/ligando a internet, simule demora.  
   - Ao clicar em uma ação crítica (ex.: Salvar venda, Dar baixa), deve aparecer mensagem do tipo “Em processamento. Aguarde.” e o botão deve continuar desabilitado até a resposta final.

5. **Listas rápidas**  
   Abra Meus Pedidos, Clientes, Contas a Receber.  
   - A busca em Meus Pedidos tem debounce (~400 ms).  
   - As listas devem abrir em tempo aceitável; se tiver muitos registros, a paginação (quando usada) mantém a resposta leve.

---

## 5) Se algum comando falhar

- **traceId**  
  Em erro ou “em processamento”, o servidor pode devolver um `traceId`. Use-o para achar o log no servidor.

- **Logs**  
  Olhe o terminal onde rodou `npm run dev`. Erros e avisos aparecem ali.

- **Página Diagnóstico**  
  Se tiver página de Diagnóstico (admin), use para conferir consistência do banco e versão do schema.

---

## 6) Limpeza de idempotência (opcional)

Para remover chaves antigas (TTL 7 dias) e “em processamento” travados (> 15 min):

- **Windows:** execute `scripts\BOTAO_LIMPAR_IDEMPOTENCY.bat`.
- **Ou:** `npx tsx scripts/maintenance/cleanup-idempotency.ts`

Detalhes em `docs/IDEMPOTENCY_DB.md`.
