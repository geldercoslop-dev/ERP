#!/usr/bin/env pwsh

# Limpar terminal
clear

# Test compilation
Write-Host "🔍 Testando compilação com config corrigida..." -ForegroundColor Cyan

# Remover dist antigos
if (Test-Path ".\dist") { 
    Remove-Item ".\dist" -Recurse -Force -ErrorAction SilentlyContinue
}

# Compilar
Write-Host "⏳ Compilando..." -ForegroundColor Yellow
$proc = & pnpm exec tsc -p tsconfig.server.json 2>&1
$exitCode = $LASTEXITCODE

Write-Host "Exit Code: $exitCode" -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })

# Verificar resultado
Write-Host ""
Write-Host "✅ Verificando saída..." -ForegroundColor Cyan

$files = @("dist/server/index.js", "dist/server/_core/index.js", "dist/shared/types/index.js")
foreach ($file in $files) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        Write-Host "✓ $file  [$size bytes]" -ForegroundColor Green
    } else {
        Write-Host "✗ $file [NOT FOUND]" -ForegroundColor Red
    }
}
