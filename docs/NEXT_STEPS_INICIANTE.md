# PrÃ³ximos passos â€” Guia para iniciante

Passo a passo simples para rodar o sistema e fazer testes manuais.

---

## 1) Ligar o MySQL (XAMPP ou outro)

- Abra o XAMPP (ou o serviÃ§o MySQL que vocÃª usa).
- Inicie o **MySQL**.
- Confirme que a porta Ã© **3306** e que o banco configurado em `.env` existe (ex.: `vendas_app`).

---

## 2) Aplicar as migrations

As migrations ficam na pasta `drizzle/`. Para criar/atualizar as tabelas:

- **0005_idempotency_keys.sql** â€” cria a tabela de idempotÃªncia.
- **0006_idempotency_unique_command_key.sql** â€” ajusta a constraint para `UNIQUE(commandName, key)`.

**Como aplicar:**  
Execute o conteÃºdo de cada arquivo `.sql` no seu cliente MySQL (phpMyAdmin, DBeaver, ou linha de comando), **na ordem** (0005 depois 0006).  
Ou use o script de migraÃ§Ã£o do projeto, se houver (ex.: `npm run db:migrate`).

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

Requer MySQL ligado e migrations aplicadas. Os testes conferem estoque, idempotÃªncia e rollback.

```bash
npm run dev
```

Sobe o servidor e o front. Acesse a URL que aparecer no terminal (ex.: `http://localhost:3000`).

---

## 4) Teste manual essencial

1. **Login admin**  
   FaÃ§a login com usuÃ¡rio admin. Confirme que o menu e as telas de admin abrem.

2. **Login vendedor**  
   FaÃ§a login com um vendedor. Confirme que sÃ³ aparecem as opÃ§Ãµes permitidas (ex.: Meus Pedidos, Clientes, Nova Venda).

3. **Nova venda â€” duplo clique**  
   Em Nova Venda, preencha e clique em â€œSalvarâ€ **duas vezes seguidas**.  
   - Deve criar **apenas um** pedido.  
   - Deve aparecer algo como â€œJÃ¡ estÃ¡ processando, aguardeâ€¦â€ no segundo clique (toast).

4. **Rede lenta / processando**  
   Com as ferramentas do navegador (Network: throttling) ou desligando/ligando a internet, simule demora.  
   - Ao clicar em uma aÃ§Ã£o crÃ­tica (ex.: Salvar venda, Dar baixa), deve aparecer mensagem do tipo â€œEm processamento. Aguarde.â€ e o botÃ£o deve continuar desabilitado atÃ© a resposta final.

5. **Listas rÃ¡pidas**  
   Abra Meus Pedidos, Clientes, Contas a Receber.  
   - A busca em Meus Pedidos tem debounce (~400 ms).  
   - As listas devem abrir em tempo aceitÃ¡vel; se tiver muitos registros, a paginaÃ§Ã£o (quando usada) mantÃ©m a resposta leve.

---

## 5) Se algum comando falhar

- **traceId**  
  Em erro ou â€œem processamentoâ€, o servidor pode devolver um `traceId`. Use-o para achar o log no servidor.

- **Logs**  
  Olhe o terminal onde rodou `npm run dev`. Erros e avisos aparecem ali.

- **PÃ¡gina DiagnÃ³stico**  
  Se tiver pÃ¡gina de DiagnÃ³stico (admin), use para conferir consistÃªncia do banco e versÃ£o do schema.

---

## 6) Limpeza de idempotÃªncia (opcional)

Para remover chaves antigas (TTL 7 dias) e â€œem processamentoâ€ travados (> 15 min):

- **Windows:** execute `scripts\BOTAO_LIMPAR_IDEMPOTENCY.bat`.
- **Ou:** `npx tsx scripts/maintenance/cleanup-idempotency.ts`

Detalhes em `docs/IDEMPOTENCY_DB.md`.
