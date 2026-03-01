# Script para iniciar o BACKEND do sistema de vendas
# Execute este script PRIMEIRO

Write-Host "🚀 Iniciando BACKEND (Servidor)..." -ForegroundColor Green
Write-Host ""
Write-Host "📋 Verificando dependências..." -ForegroundColor Yellow

# Define variável de ambiente para Windows
$env:NODE_ENV="development"

# Verifica se pnpm está instalado
try {
    pnpm --version | Out-Null
    Write-Host "✅ pnpm encontrado!" -ForegroundColor Green
} catch {
    Write-Host "❌ ERRO: pnpm não está instalado!" -ForegroundColor Red
    Write-Host "Instale com: npm install -g pnpm" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔧 Iniciando servidor na porta 3000..." -ForegroundColor Cyan
Write-Host "⚠️  Mantenha esta janela ABERTA!" -ForegroundColor Yellow
Write-Host "⚠️  Abra OUTRA janela para rodar o frontend" -ForegroundColor Yellow
Write-Host ""

# Inicia o servidor
npx tsx watch server/_core/index.ts
