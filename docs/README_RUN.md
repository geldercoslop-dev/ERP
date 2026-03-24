## README_RUN (execuÃ§Ã£o rÃ¡pida)

Este arquivo Ã© um guia curto para rodar o ERP localmente sem â€œpegadinhasâ€.

### PrÃ©-requisitos

- Node.js (LTS recomendado)
- MySQL rodando (porta padrÃ£o 3306 ou conforme `.env`)

### Setup (primeira vez)

1) Instale dependÃªncias:

```bash
npm install
```

2) Configure ambiente:

- Copie `.env.example` para `.env` e ajuste as variÃ¡veis do banco.

3) Verifique conexÃ£o com o banco:

```bash
npm run check:db
```

4) (DEV) Alinhe schema em desenvolvimento:

```bash
npm run db:push:dev
```

### Rodar em DEV

```bash
npm run dev
```

Abra o sistema na URL informada no terminal (ex.: `http://localhost:3000`).

### Comandos de validaÃ§Ã£o (obrigatÃ³rios por fase do roadmap)

```bash
npm run check
npm run dev
```

### Smoke test rÃ¡pido (manual)

- **Login**: entrar como admin e como vendedor
- **Debug**: abrir `/debug-auth` e validar `user.id`, `role` e `origin` da sessÃ£o
- **Telas principais**:
  - Novo Pedido (`/nova-venda`)
  - Meus Pedidos (`/meus-pedidos`)
  - Clientes (`/clientes`)
  - Estoque (`/estoque`)
  - Boletos/Vencimentos (`/boletos`)

