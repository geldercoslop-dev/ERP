# NGINX + Firewall - Expor API na Internet

## 📋 Pré-requisitos
- Servidor Linux (Ubuntu 20.04+)
- Docker com container da API rodando na porta 3000
- Acesso root/sudo

## 🚀 Instalação e Configuração

### PASSO 1: Instalar NGINX

```bash
sudo apt update
sudo apt install nginx -y
```

### PASSO 2: Configurar NGINX como Proxy Reverso

Editar arquivo de configuração:
```bash
sudo nano /etc/nginx/sites-available/erp
```

Colar o seguinte conteúdo:
```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Salvar com: `Ctrl+X` → `Y` → `Enter`

### PASSO 3: Ativar Site NGINX

```bash
sudo ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

Testar configuração:
```bash
sudo nginx -t
```

Deve retornar:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Reiniciar NGINX:
```bash
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### PASSO 4: Configurar Firewall (UFW)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Verificar status:
```bash
sudo ufw status
```

## ✅ Validação

### 1. Obter IP do servidor
```bash
hostname -I
```

Exemplo: `192.168.1.100`

### 2. Testar via navegador
Abrir em qualquer navegador:
```
http://SEU_IP
```

Exemplo: `http://192.168.1.100`

### 3. Testar endpoint de saúde
```bash
curl http://localhost/internal/health
```

Deve retornar status 200 com resposta JSON.

### 4. Verificar logs NGINX
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🔐 SSL/HTTPS com Let's Encrypt (Opcional)

Para adicionar HTTPS seguro:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d seu-dominio.com
```

## 🛠️ Troubleshooting

### NGINX não inicia
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### Porta 80 já em uso
```bash
sudo lsof -i :80
sudo kill -9 <PID>
```

### Firewall bloqueando
```bash
sudo ufw allow 80
sudo ufw allow 443
sudo systemctl restart ufw
```

### Container não responde
```bash
docker ps
docker logs <container_id>
curl http://localhost:3000/internal/health
```

## 📌 Automatizar com script

Use o script fornecido:
```bash
sudo bash nginx-config.sh
```

Este script automatiza todos os passos acima.

## 🎯 Resultado Final

- ✅ API acessível na porta 80 (HTTP)
- ✅ NGINX fazendo proxy reverso para localhost:3000
- ✅ Firewall protegendo servidor
- ✅ Logs de acesso disponíveis
- ✅ Pronto para produção
