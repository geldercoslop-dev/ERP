#!/usr/bin/env bash
# deploy.sh — sobe o ERP rapidamente (install, build, PM2).
# Executar na raiz do projeto: ./scripts/deploy.sh

set -e
cd "$(dirname "$0")/.."

echo "[deploy] Instalando dependências..."
pnpm install

echo "[deploy] Build (client + server)..."
pnpm run build

echo "[deploy] Iniciando PM2 (erp-server)..."
pnpm run pm2:start

echo "[deploy] Concluído. Verifique: pm2 status && curl -s http://localhost:3000/api/health | head -1"
