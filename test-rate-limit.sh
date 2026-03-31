#!/bin/bash
# Teste de Rate Limit - Validação de Proteção contra Flood

echo "🚀 Iniciando teste de rate limit..."
echo "=================================="

# Teste 1: Requests normais (deve passar)
echo ""
echo "📊 Teste 1: Requests normais (50 req em 30s)"
echo "Esperado: Todas devem passar (HTTP 200)"

for i in {1..50}; do
  response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/health" 2>/dev/null)
  if [ "$response" = "200" ]; then
    echo -n "✓"
  else
    echo -n "✗($response)"
  fi
  sleep 0.6
done

echo ""
echo ""
echo "📊 Teste 2: Flood attack (150 req em 30s)"
echo "Esperado: Bloqueadas após 60 (HTTP 429)"

blocked_count=0
passed_count=0

for i in {1..150}; do
  response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/health" 2>/dev/null)
  if [ "$response" = "429" ]; then
    blocked_count=$((blocked_count + 1))
    echo -n "🚫"
  elif [ "$response" = "200" ]; then
    passed_count=$((passed_count + 1))
    echo -n "✓"
  else
    echo -n "?($response)"
  fi
  sleep 0.2
done

echo ""
echo ""
echo "=================================="
echo "📈 RESULTADOS:"
echo "Requests passadas: $passed_count"
echo "Requests bloqueadas: $blocked_count"
echo ""

if [ $passed_count -le 60 ] && [ $blocked_count -gt 0 ]; then
  echo "✅ RATE LIMIT FUNCIONANDO CORRETAMENTE"
  echo "- Proteção contra flood ativa"
  echo "- Limite de 60 req/min respeitado"
else
  echo "❌ RATE LIMIT NÃO FUNCIONANDO"
  echo "- Flood não foi bloqueado adequadamente"
fi

echo ""
echo "🧪 Teste finalizado"
