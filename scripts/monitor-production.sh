#!/bin/bash

# Script de Monitoramento PM2 - Produção
# Uso: ./scripts/monitor-production.sh

set -e

APP_NAME="erp-app"

echo "📊 Monitoramento PM2 - ERP Produção"
echo "=================================="

# Status geral
echo "🔍 Status PM2:"
pm2 status

echo ""
echo "📈 Métricas em tempo real:"
pm2 monit --no-daemon &
MONITOR_PID=$!

# Espera 5 segundos e para o monitor
sleep 5
kill $MONITOR_PID 2>/dev/null || true

echo ""
echo "💾 Uso de memória:"
pm2 show "$APP_NAME" | grep -E "(memory|heap)"

echo ""
echo "📋 Logs recentes (últimas 20 linhas):"
pm2 logs "$APP_NAME" --lines 20 --nostream

echo ""
echo "🔄 Restart history:"
pm2 restart

echo ""
echo "🔍 Verificando health check:"
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Health check OK"
    curl -s http://localhost:3000/health | jq '.status, .timestamp, .uptime' 2>/dev/null || echo "Health check responded"
else
    echo "❌ Health check falhou"
fi

echo ""
echo "📊 Estatísticas PM2:"
pm2 describe "$APP_NAME" | grep -E "(restart|uptime|cpu|memory)"

echo ""
echo "🎯 Recomendações:"
echo "- Use 'pm2 monit' para monitoramento em tempo real"
echo "- Use 'pm2 logs' para ver logs completos"
echo "- Use 'pm2 reload' para reload sem downtime"
echo "- Use 'pm2 restart' para restart completo"
