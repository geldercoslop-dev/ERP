# Deploy automatizado do ERP

Objetivo: subir o sistema rapidamente em um servidor Linux usando scripts.

---

## VisÃ£o geral

1. **setup-server.sh** â€” instala Nginx, Node.js, npm, pnpm e PM2 no servidor e configura o Nginx (proxy para o app).
2. **deploy.sh** â€” na raiz do projeto: instala dependÃªncias, faz o build e inicia o app com PM2.

Use **setup-server.sh** uma vez em um servidor novo; use **deploy.sh** sempre que quiser (re)instalar e subir o ERP (por exemplo apÃ³s `git pull`).

---

## PrÃ©-requisitos

- Servidor Linux (Ubuntu/Debian) com acesso root ou sudo
- Projeto na mÃ¡quina (git clone ou cÃ³pia), por exemplo em `/var/www/erp`
- Banco MySQL/MariaDB acessÃ­vel e `.env.production` (ou variÃ¡veis de ambiente) configurado com `DATABASE_URL`, `JWT_SECRET`, `PORT=3000`

---

## Passo a passo â€” servidor novo

### 1. Colocar o projeto no servidor

```bash
cd /var/www
git clone <url-do-repositorio> erp
cd erp
```

(Ou copie o projeto por rsync/scp para `/var/www/erp` e entre na pasta.)

### 2. Configurar variÃ¡veis de ambiente

```bash
cp .env.production.example .env.production
nano .env.production
```

Preencha pelo menos: `PORT=3000`, `DATABASE_URL`, `JWT_SECRET`. Salve e feche.

### 3. Instalar dependÃªncias do servidor (Nginx, Node, pnpm, PM2)

Na **raiz do projeto** (`/var/www/erp`):

```bash
sudo chmod +x scripts/setup-server.sh
sudo ./scripts/setup-server.sh
```

O script executa:

- `apt update` e `apt install nginx nodejs npm -y`
- `npm install -g pnpm` e `npm install -g pm2`
- Copia `deployment/nginx.conf` para `/etc/nginx/sites-available/erp`
- Cria o link em `/etc/nginx/sites-enabled/erp`
- `nginx -t` e `systemctl restart nginx`

FaÃ§a este passo **uma vez** no servidor (ou quando quiser reinstalar Nginx/Node/PM2).

### 4. Dar permissÃ£o de execuÃ§Ã£o ao deploy e rodar o deploy

Na **raiz do projeto**:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

O script executa:

- `pnpm install`
- `pnpm run build`
- `pnpm run pm2:start`

O backend sobe na porta 3000 (PM2) e o Nginx jÃ¡ repassa a porta 80 para 3000.

### 5. Conferir se estÃ¡ no ar

```bash
pm2 status
curl -s http://localhost:3000/api/health
curl -s http://localhost/api/health
```

O primeiro curl testa o app direto; o segundo, pelo Nginx. Ambos devem retornar JSON com `status`, `database`, etc.

### 6. (Opcional) Persistir o PM2 apÃ³s reboot

```bash
pm2 startup
pm2 save
```

---

## Resumo dos scripts

| Script | Onde rodar | O que faz |
|--------|------------|-----------|
| **scripts/setup-server.sh** | Raiz do projeto, com **sudo** | Instala Nginx, Node, npm, pnpm, PM2; copia e ativa `deployment/nginx.conf`; reinicia Nginx |
| **scripts/deploy.sh** | Raiz do projeto | `pnpm install` â†’ `pnpm run build` â†’ `pnpm run pm2:start` |

---

## Atualizar o ERP depois (apÃ³s git pull)

Na raiz do projeto:

```bash
git pull
./scripts/deploy.sh
```

Ou, se preferir sÃ³ reiniciar sem build:

```bash
pm2 restart erp-server
```

---

## DomÃ­nio (server_name)

O `deployment/nginx.conf` usa `server_name erp.local`. Para usar um domÃ­nio real (ex.: `erp.seudominio.com`):

1. Edite o arquivo no servidor:  
   `sudo nano /etc/nginx/sites-available/erp`  
   Altere `server_name erp.local;` para `server_name erp.seudominio.com;`
2. Teste e recarregue:  
   `sudo nginx -t && sudo systemctl reload nginx`
3. Aponte o DNS do domÃ­nio para o IP do servidor.

---

## Troubleshooting

- **Porta 3000 em uso:** verifique com `ss -tlnp | grep 3000` ou `lsof -i :3000`. Ajuste `PORT` no `.env.production` e, se mudar a porta, edite `proxy_pass` em `/etc/nginx/sites-available/erp`.
- **Nginx nÃ£o inicia:** `sudo nginx -t` e `journalctl -u nginx -n 50`.
- **PM2 nÃ£o inicia o app:** `pm2 logs erp-server` e confira `.env.production` (e se o build existe: `ls dist/server/_core/index.js`).
- **502 Bad Gateway:** o app nÃ£o estÃ¡ ouvindo em 3000; confira `pm2 status` e logs do erp-server.

DocumentaÃ§Ã£o detalhada de deploy manual: `deployment/DEPLOY.md`. Nginx: `docs/NGINX_DEPLOY.md`.
