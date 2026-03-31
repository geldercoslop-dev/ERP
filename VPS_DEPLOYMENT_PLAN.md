# 🚀 PLANO DE DEPLOYMENT VPS - BACKEND

**Data:** 2026-03-24  
**IP VPS:** 62.146.227.138  
**Status:** Aguardando configuração de acesso SSH

---

## ⚠️ BLOQUEADOR ATUAL

SSH está pedindo autenticação por senha. Para proceder, é necessário:

### Opção 1: Usar Senha (Interativo)
```powershell
# Use PuTTY ou OpenSSH com suporte a senha interativa
# ou execute manualmente:
ssh root@62.146.227.138
# Digite a senha quando solicitado
```

### Opção 2: Usar Chave SSH
```powershell
# Se tiver arquivo .pem ou chave privada:
ssh -i "C:\caminho\para\chave.pem" root@62.146.227.138
```

### Opção 3: Usar script automatizado
Preciso apenas da senha root da VPS para criar um script não-interativo.

---

## 📋 TAREFAS A EXECUTAR (na VPS)

```bash
# 1. Update sistema
apt update -y && apt upgrade -y

# 2. Instalar dependências
apt install -y nodejs npm git curl wget

# 3. Instalar Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install -y docker-compose

# 4. Clonar projeto
cd /opt
git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo

# 5. Instalar dependências Node
npm install
# ou
pnpm install

# 6. Criar arquivo .env.production
cat > .env.production << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://vendas:vendas123@localhost:3306/vendas_app
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET=seu-secret-aqui
JWT_REFRESH_SECRET=seu-secret-aqui
APP_SECRET=seu-secret-aqui
SESSION_SECRET=seu-secret-aqui
EOF

# 7. Build backend
npm run build

# 8. Subir Docker (MySQL + Redis)
docker compose -f docker-compose.infra.yml up -d

# 9. Esperar containers ficarem healthy
sleep 30
docker compose ps

# 10. Subir backend
npm run start:prod
# ou via PM2:
npm install -g pm2
pm2 start "npm run start:prod" --name "erp-backend"
pm2 save
pm2 startup

# 11. Verificar se está rodando
curl http://localhost:3000/api/health
```

---

## 🔄 PRÓXIMOS PASSOS

1. **[AGUARDANDO]** Autenticação SSH com a VPS
2. Executar scripts de instalação
3. Validar backend rodando em 62.146.227.138:3000
4. Configurar Nginx reverse proxy (opcional)
5. Configurar SSL/HTTPS
6. Monitoramento e logs

---

## 📌 INFORMAÇÕES NECESSÁRIAS

Para proceder automaticamente, preciso de uma das seguintes:

- [ ] Senha root da VPS
- [ ] Caminho para arquivo chave SSH (.pem)
- [ ] Token pessoal do GitHub (para clonar repo privado)
- [ ] URL do repositório (para público)

---

**Aguardando instruções para continuar...**
