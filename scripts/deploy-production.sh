#!/bin/bash

# Script de Deploy com Restart Automático - Produção
# Uso: ./scripts/deploy-production.sh

set -e

echo "🚀 Iniciando deploy em produção..."

# Variáveis
APP_NAME="erp-app"
BACKUP_DIR="./backups"
LOGS_DIR="./logs"
BUILD_DIR="./dist"

# Criar diretórios necessários
mkdir -p "$BACKUP_DIR"
mkdir -p "$LOGS_DIR"

echo "📦 Realizando backup do estado atual..."

# Backup do estado atual
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="pre_deploy_${TIMESTAMP}"

# Parar aplicação atual
echo "⏹️ Parando aplicação atual..."
pm2 stop "$APP_NAME" || echo "⚠️ Aplicação não estava rodando"

# Backup dos arquivos
if [ -d "$BUILD_DIR" ]; then
  tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "$BUILD_DIR"
  echo "✅ Backup criado: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
fi

echo "🔨 Build da aplicação..."

# Limpar build anterior
rm -rf "$BUILD_DIR"

# Instalar dependências
echo "📥 Instalando dependências..."
pnpm install --frozen-lockfile --prod

# Build da aplicação
echo "🏗️ Build do frontend..."
pnpm run build:client

echo "🏗️ Build do backend..."
pnpm run build:server

echo "🧪 Verificando build..."

# Verificar se build foi bem sucedido
if [ ! -f "$BUILD_DIR/server/index.js" ]; then
  echo "❌ Build falhou - arquivo principal não encontrado"
  echo "🔄 Restaurando backup..."
  tar -xzf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
  pm2 start "$APP_NAME"
  exit 1
fi

echo "🔍 Health check do build..."

# Teste rápido do build
timeout 10s node "$BUILD_DIR/server/index.js" --health-check || {
  echo "❌ Health check falhou"
  echo "🔄 Restaurando backup..."
  tar -xzf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
  pm2 start "$APP_NAME"
  exit 1
}

echo "🚀 Iniciando aplicação com PM2..."

# Iniciar com PM2
pm2 start ecosystem.config.production.json --env production

echo "⏳ Aguardando inicialização..."

# Aguardar aplicação iniciar
sleep 10

# Verificar se está rodando
if pm2 list | grep -q "$APP_NAME.*online"; then
  echo "✅ Aplicação iniciada com sucesso"
  
  # Health check
  echo "🔍 Verificando saúde da aplicação..."
  
  for i in {1..5}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
      echo "✅ Health check passou"
      break
    else
      echo "⏳ Tentativa $i/5 de health check..."
      sleep 5
    fi
  done
  
  # Limpar backups antigos (manter últimos 5)
  echo "🧹 Limpando backups antigos..."
  find "$BACKUP_DIR" -name "pre_deploy_*.tar.gz" | sort -r | tail -n +6 | xargs rm -f
  
  echo "🎉 Deploy concluído com sucesso!"
  echo "📊 Status:"
  pm2 status "$APP_NAME"
  
else
  echo "❌ Falha ao iniciar aplicação"
  echo "🔄 Restaurando backup..."
  tar -xzf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
  pm2 start "$APP_NAME"
  exit 1
fi

echo "📈 Logs recentes:"
pm2 logs "$APP_NAME" --lines 20 --nostream
