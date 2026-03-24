# Script para iniciar o FRONTEND do sistema de vendas
# Execute este script DEPOIS do backend

Write-Host "🎨 Iniciando FRONTEND (Interface)..." -ForegroundColor Green
Write-Host ""

# Entra na pasta client
Set-Location client

Write-Host "📋 Verificando dependências..." -ForegroundColor Yellow

# Verifica se node_modules existe
if (-Not (Test-Path "node_modules")) {
    Write-Host "⚠️  node_modules não encontrado, instalando..." -ForegroundColor Yellow
    pnpm install
}

Write-Host ""
Write-Host "🌐 Iniciando interface na porta 5173..." -ForegroundColor Cyan
Write-Host "⚠️  Abra seu navegador em: http://localhost:5173" -ForegroundColor Yellow
Write-Host ""

# Inicia o Vite
npx vite
