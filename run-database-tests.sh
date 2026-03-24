#!/bin/bash

# Script para executar testes reais de consistência do banco

echo "🚀 INICIANDO TESTES DE CONSISTÊNCIA DO BANCO"
echo "=============================================="
echo ""

# Validar se .env.local existe
if [ ! -f ".env.local" ]; then
  echo "⚠️  AVISO: .env.local não encontrado"
  echo "   Usando variáveis de ambiente padrão"
fi

# Compilar TypeScript do teste se necessário
echo "📝 Compilando testes..."
npx tsc server/tests/database-consistency.test.ts --skipLibCheck 2>/dev/null

# Executar teste
echo ""
echo "🧪 Executando testes de consistência..."
echo ""

node --require ts-node/register \
  --require dotenv/config \
  server/tests/database-consistency.test.ts

TEST_EXIT_CODE=$?

echo ""
echo "=============================================="
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ TESTES PASSARAM"
else
  echo "❌ TESTES FALHARAM (exit code: $TEST_EXIT_CODE)"
fi
echo "=============================================="

exit $TEST_EXIT_CODE
