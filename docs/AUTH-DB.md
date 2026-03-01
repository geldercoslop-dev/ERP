# Autenticação em banco (bcrypt)

## Como funciona

- **Login**: O tRPC `auth.login` recebe `username` e `password`.
  1. Busca vendedor no DB pelo **nome** (case-insensitive).
  2. Se existir e o campo `senha` for um hash bcrypt (`$2...`), valida com `bcrypt.compare`.
  3. Se bater, define o cookie `v:{vendedorId}` e retorna os dados do vendedor (nome, role admin/vendedor).
  4. Se não achar vendedor ou senha não bater, usa o **fallback** em código (admin/admin123, vendedor/vendedor123).

- **Cookie**: `v:5` = vendedor com id 5. O context carrega o vendedor pelo id e monta o `ctx.user`.

- **Criar/editar vendedor** (tela Vendedores): A senha é **hasheada com bcrypt** antes de salvar. Nunca salve senha em texto puro.

## Primeiro acesso (admin no DB)

1. Instale dependências: `pnpm install` (inclui bcryptjs).
2. Crie o primeiro vendedor admin no banco:
   ```bash
   pnpm run seed:admin
   ```
   Isso cria um vendedor com nome `admin`, senha `admin123`, admin=true.
3. Faça login no app com usuário **admin** e senha **admin123**.
4. Recomendado: altere a senha desse vendedor pela tela Vendedores após o primeiro acesso.

## Novos vendedores

- Cadastre em **Vendedores** (menu Admin). A senha informada é hasheada e salva.
- Eles passam a fazer login com o **nome** cadastrado e a senha definida.

## Fallback (dev/MVP)

- Se não houver vendedor no DB com o nome informado (ou a senha não for hash bcrypt), continuam valendo:
  - **admin** / **admin123**
  - **vendedor** / **vendedor123** (ou senha 4 dígitos)
- Assim o app segue funcionando sem rodar o seed.
