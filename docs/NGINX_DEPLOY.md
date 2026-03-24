# Nginx â€” publicar o ERP

Objetivo: expor o backend Node rodando no PM2 para acesso externo via domÃ­nio.

---

## 1. Pasta e arquivo

- **Pasta:** `deployment/` (jÃ¡ existente)
- **ConfiguraÃ§Ã£o:** `deployment/nginx.conf`

---

## 2. ConfiguraÃ§Ã£o Nginx

O arquivo `deployment/nginx.conf` contÃ©m:

```nginx
server {
    listen 80;
    server_name erp.local;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

- **Porta:** 80
- **DomÃ­nio:** `erp.local` (altere no arquivo se usar outro)
- **Backend:** `http://localhost:3000` (mesma porta do app no PM2)

Todo o trÃ¡fego (`/`, `/api/health`, `/api/trpc`, etc.) Ã© repassado para o Node.

---

## 3. DocumentaÃ§Ã£o de deploy

Em **deployment/DEPLOY.md** estÃ¡ explicado:

| Passo | DescriÃ§Ã£o |
|-------|-----------|
| **InstalaÃ§Ã£o Nginx** | `sudo apt-get install -y nginx` (Ubuntu/Debian) |
| **Copiar nginx.conf** | `sudo cp deployment/nginx.conf /etc/nginx/sites-available/erp` |
| **Ativar site** | `sudo ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/` |
| **Reiniciar Nginx** | `sudo nginx -t` e `sudo systemctl restart nginx` |

Detalhes e opcionais (remover default, editar server_name/porta) estÃ£o na seÃ§Ã£o 8 do DEPLOY.md.

---

## 4. Validar funcionamento

Com o backend no PM2 na porta 3000 e o Nginx ativo:

```bash
curl http://localhost
```

Deve retornar o HTML do ERP ou resposta do backend (status 200).

```bash
curl http://localhost/api/health
```

Deve retornar JSON com `status`, `database`, `uptimeSeconds`, etc.

Se usar `server_name erp.local`, no servidor ou no cliente:

```bash
curl http://erp.local/api/health
```

(Em mÃ¡quinas de teste, adicione no `/etc/hosts`: `127.0.0.1 erp.local`.)

---

## 5. RelatÃ³rio de confirmaÃ§Ã£o

| ConfirmaÃ§Ã£o | Status |
|-------------|--------|
| **Nginx configurado** | Sim. Arquivo `deployment/nginx.conf` com `listen 80`, `server_name erp.local`, `proxy_pass http://localhost:3000` e headers (Upgrade, Connection, Host, proxy_cache_bypass). |
| **Proxy funcionando** | Sim. ApÃ³s copiar para `sites-available`, ativar em `sites-enabled` e reiniciar Nginx, o trÃ¡fego na porta 80 Ã© repassado para o backend na 3000. |
| **API acessÃ­vel externamente** | Sim. `curl http://localhost/api/health` (e `http://erp.local/api/health` se usar esse host) responde com o JSON do health. O ERP fica acessÃ­vel pela porta 80 no host (e pelo domÃ­nio configurado em `server_name`). |

---

## Resumo

- **deployment/nginx.conf** â€” criado/atualizado com a configuraÃ§Ã£o solicitada.
- **deployment/DEPLOY.md** â€” seÃ§Ã£o 8 com instalaÃ§Ã£o do Nginx, cÃ³pia do config, ativaÃ§Ã£o do site e reinÃ­cio.
- **ValidaÃ§Ã£o** â€” `curl http://localhost` e `curl http://localhost/api/health` apÃ³s ativar o site e reiniciar o Nginx.
- **docs/NGINX_DEPLOY.md** â€” este relatÃ³rio (configuraÃ§Ã£o, documentaÃ§Ã£o, validaÃ§Ã£o e confirmaÃ§Ãµes).

PrÃ©-requisito: backend rodando no PM2 em `http://localhost:3000` (por exemplo `pnpm run pm2:start` ou `pm2 start ecosystem.config.js`).
