#!/bin/bash

# Script para configurar NGINX + Firewall e expor API na internet
# Executar com: sudo bash nginx-config.sh

set -e

echo "=== PASSO 1: Atualizando pacotes ==="
apt update
apt install nginx -y

echo "=== PASSO 2: Configurando NGINX como proxy reverso ==="
cat > /etc/nginx/sites-available/erp << 'EOF'
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
EOF

echo "=== PASSO 3: Ativando site NGINX ==="
ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "=== PASSO 4: Testando configuração NGINX ==="
nginx -t

echo "=== PASSO 5: Reiniciando NGINX ==="
systemctl restart nginx
systemctl enable nginx

echo "=== PASSO 6: Configurando Firewall (UFW) ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "✅ CONFIGURAÇÃO CONCLUÍDA!"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo "1. Verificar IP do servidor: hostname -I"
echo "2. Acessar no navegador: http://SEU_IP"
echo "3. Testar saúde da API: curl http://localhost/internal/health"
echo ""
echo "🔒 FIREWALL STATUS:"
ufw status

echo ""
echo "🌐 NGINX STATUS:"
systemctl status nginx --no-pager
