# Deploy do ERP em servidor Linux

Guia passo a passo para colocar o sistema em produÃ§Ã£o quando o build do backend estiver corrigido. NÃ£o altera lÃ³gica, banco, autenticaÃ§Ã£o nem rotas â€” apenas prepara o ambiente.

---

## PrÃ©-requisitos

- Servidor Linux (Ubuntu/Debian ou similar)
- Acesso root ou sudo
- Node.js 20+ e pnpm instalados (ou seguir passos abaixo)
- MySQL/MariaDB para o banco de dados
- (Opcional) Nginx como reverso proxy

---

## 1. Instalar Node.js

```bash
# Ubuntu/Debian (Node 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar
node -v   # v20.x.x
npm -v
```

---

## 2. Instalar pnpm

```bash
npm install -g pnpm

# Verificar
pnpm -v
```

---

## 3. Clonar / enviar o projeto para o servidor

Envie o cÃ³digo (git clone, rsync, etc.) para o servidor, por exemplo em `/var/www/erp` ou `~/erp`.

```bash
cd /var/www/erp   # ou seu diretÃ³rio
```

---

## 4. Instalar dependÃªncias

```bash
pnpm install
```

---

## 5. VariÃ¡veis de ambiente (produÃ§Ã£o)

Crie o arquivo de produÃ§Ã£o a partir do modelo (nÃ£o commitar o `.env.production`):

```bash
cp deployment/env.example .env.production
# ou
cp deployment/.env.production.example .env.production
```

Edite `.env.production` e defina pelo menos:

- `NODE_ENV=production`
- `PORT=3000` (ou a porta que o app vai escutar)
- `DATABASE_URL=mysql://usuario:senha@host:3306/nome_do_banco`
- `JWT_SECRET=` um secret longo e aleatÃ³rio (obrigatÃ³rio em produÃ§Ã£o)

Carregue as variÃ¡veis antes de rodar o app (ex.: `export $(cat .env.production | xargs)` ou use um gerenciador de processos que leia o arquivo).

---

## 6. Build de produÃ§Ã£o

Na raiz do projeto:

```bash
pnpm run build:prod
```

Isso executa `pnpm run build` e `pnpm run build:server`, gerando o cliente em `dist/client` e (quando o build do backend estiver corrigido) o servidor em `dist/server`. O PM2 espera o entry em `dist/server/_core/index.js`.

---

## 7. Iniciar com PM2

Instale o PM2 globalmente (se ainda nÃ£o tiver):

```bash
npm install -g pm2
```

Inicie o app a partir da **raiz do projeto**, para o `cwd` e o path do script estarem corretos:

```bash
cd /var/www/erp
NODE_ENV=production pm2 start deployment/ecosystem.config.js
```

Ou, passando o config explicitamente:

```bash
pm2 start ecosystem.config.js --config deployment/ecosystem.config.js
```

Comandos Ãºteis:

```bash
pm2 list
pm2 logs erp-server
pm2 restart erp-server
pm2 stop erp-server
```

Para subir o PM2 apÃ³s reboot do servidor:

```bash
pm2 startup
pm2 save
```

---

## 8. Configurar Nginx (reverso proxy)

Expor o backend Node (PM2) para acesso externo via domÃ­nio.

### 8.1 InstalaÃ§Ã£o do Nginx

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nginx

# Verificar
nginx -v
```

### 8.2 Copiar nginx.conf

Na raiz do projeto (ou de onde estiver o repositÃ³rio):

```bash
sudo cp deployment/nginx.conf /etc/nginx/sites-available/erp
```

O arquivo usa `server_name erp.local` e `proxy_pass http://localhost:3000`. Para outro domÃ­nio ou porta, edite antes de ativar:

```bash
sudo nano /etc/nginx/sites-available/erp
```

- `server_name` â†’ seu domÃ­nio (ex.: `erp.seudominio.com` ou `erp.local`)
- `proxy_pass` â†’ mesma porta do app (padrÃ£o 3000)

### 8.3 Ativar o site

```bash
sudo ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
```

(Opcional) Remover site padrÃ£o se estiver em conflito:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

### 8.4 Testar configuraÃ§Ã£o e reiniciar Nginx

```bash
sudo nginx -t
sudo systemctl restart nginx
```

Se `nginx -t` mostrar "syntax is ok", o proxy estÃ¡ ativo. Teste:

```bash
curl http://localhost
curl http://localhost/api/health
```

Para usar `erp.local` no navegador, adicione no `/etc/hosts` (ou no cliente): `127.0.0.1 erp.local`.

---

## 9. Health check pÃºblico

A rota **GET /api/health** jÃ¡ estÃ¡ disponÃ­vel em produÃ§Ã£o (sem autenticaÃ§Ã£o). Use para monitoramento e load balancer.

Testar:

```bash
curl http://localhost:3000/api/health
# ou, atrÃ¡s do Nginx:
curl http://seu-dominio/api/health
```

Resposta esperada (exemplo): `{"status":"ok","timestamp":"...","uptimeSeconds":...,"nodeEnv":"production",...}`.

---

## 10. Checklist pÃ³s-deploy

- [ ] `.env.production` configurado (DATABASE_URL, JWT_SECRET, PORT, NODE_ENV)
- [ ] `pnpm run build:prod` executado sem erro
- [ ] PM2 iniciado na raiz do projeto com `deployment/ecosystem.config.js`
- [ ] GET /api/health retorna 200 e `status: "ok"` ou `"degraded"` conforme banco
- [ ] Nginx (se usado) apontando para a porta correta e recarregado
- [ ] Backup do banco antes de qualquer migraÃ§Ã£o; usar apenas migraÃ§Ãµes em produÃ§Ã£o (nÃ£o `db:push`)

---

## Resumo de comandos (na raiz do projeto)

```bash
pnpm install
cp deployment/env.example .env.production
# editar .env.production
pnpm run build:prod
NODE_ENV=production pm2 start deployment/ecosystem.config.js
pm2 save && pm2 startup
```

DocumentaÃ§Ã£o de migraÃ§Ãµes e operaÃ§Ã£o: `docs/architecture/DEPLOY.md` (backup, migraÃ§Ãµes, rollback).
