## README_RUN (execução rápida)

Este arquivo é um guia curto para rodar o ERP localmente sem “pegadinhas”.

### Pré-requisitos

- Node.js (LTS recomendado)
- MySQL rodando (porta padrão 3306 ou conforme `.env`)

### Setup (primeira vez)

1) Instale dependências:

```bash
npm install
```

2) Configure ambiente:

- Copie `.env.example` para `.env` e ajuste as variáveis do banco.

3) Verifique conexão com o banco:

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

Abra o sistema na URL informada no terminal (ex.: `http://localhost:3003`).

### Comandos de validação (obrigatórios por fase do roadmap)

```bash
npm run check
npm run dev
```

### Smoke test rápido (manual)

- **Login**: entrar como admin e como vendedor
- **Debug**: abrir `/debug-auth` e validar `user.id`, `role` e `origin` da sessão
- **Telas principais**:
  - Novo Pedido (`/nova-venda`)
  - Meus Pedidos (`/meus-pedidos`)
  - Clientes (`/clientes`)
  - Estoque (`/estoque`)
  - Boletos/Vencimentos (`/boletos`)

