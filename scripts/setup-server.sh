#!/usr/bin/env bash
# setup-server.sh — instala dependências do servidor (Nginx, Node, pnpm, PM2) e configura Nginx.
# Executar na raiz do projeto com sudo: sudo ./scripts/setup-server.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[setup-server] Atualizando pacotes..."
apt-get update -y

echo "[setup-server] Instalando Nginx, Node.js e npm..."
apt-get install -y nginx nodejs npm

echo "[setup-server] Instalando pnpm globalmente..."
npm install -g pnpm

echo "[setup-server] Instalando PM2 globalmente..."
npm install -g pm2

echo "[setup-server] Configurando Nginx (deployment/nginx.conf -> sites-available/erp)..."
cp "$ROOT/deployment/nginx.conf" /etc/nginx/sites-available/erp

echo "[setup-server] Ativando site erp..."
ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/erp

echo "[setup-server] Testando configuração Nginx..."
nginx -t

echo "[setup-server] Reiniciando Nginx..."
systemctl restart nginx

echo "[setup-server] Concluído. Nginx ativo; instale o app (pnpm install, build) e inicie o PM2 (pnpm run pm2:start) na raiz do projeto."
