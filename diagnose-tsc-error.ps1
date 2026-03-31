#!/usr/bin/env pwsh
# Script para diagnosticar erro silencioso do tsc

Write-Host "=== DIAGNÓSTICO TSC NODEXT ===" -ForegroundColor Cyan
Write-Host ""

# Teste 1: Verificar se tsc existe
Write-Host "[1] Verificando tsc..." -ForegroundColor Yellow
$tscVersion = & pnpm exec tsc --version 2>&1
Write-Host "Versão: $tscVersion"
Write-Host ""

# Teste 2: Tentar compilar com dump detalhado
Write-Host "[2] Tentando compilar server com tsconfig.server.json..." -ForegroundColor Yellow
$output = & pnpm exec tsc -p tsconfig.server.json 2>&1
$exitCode = $LASTEXITCODE
Write-Host "Exit Code: $exitCode"
Write-Host "Output: '$output'"
Write-Host ""

# Teste 3: Verificar se arquivo foi criado
Write-Host "[3] Verificando arquivos gerados..." -ForegroundColor Yellow
if (Test-Path dist/server/index.js) {
    Write-Host "✅ dist/server/index.js EXISTE" -ForegroundColor Green
    $size = (Get-Item dist/server/index.js).Length
    Write-Host "Tamanho: $size bytes"
} else {
    Write-Host "❌ dist/server/index.js NÃO EXISTE" -ForegroundColor Red
}
Write-Host ""

# Teste 4: Tentar com opção de diagnóstico
Write-Host "[4] Compilando com --extendedDiagnostics..." -ForegroundColor Yellow
$diag = & pnpm exec tsc -p tsconfig.server.json --extendedDiagnostics 2>&1
Write-Host "Diagnóstico: $diag" 
Write-Host ""

# Teste 5: Tentar com incrementalDependencyResolution
Write-Host "[5] Testando com arquivo singular (test-import-pattern.ts)..." -ForegroundColor Yellow
$testContent = @"
import "./_core/init-protection.js";
import "./_core/index.js"; 
"@
$testContent | Out-File test-tsc-pattern.ts -Encoding UTF8
$patternTest = & pnpm exec tsc test-tsc-pattern.ts --module NodeNext --outDir test-out 2>&1
$exitPatten = $LASTEXITCODE
Write-Host "Exit Code: $exitPatten"
Write-Host "Output: '$patternTest'"
Write-Host ""

# Teste 6: Tentar compilar apenas init-protection.ts
Write-Host "[6] Compilando apenas server/_core/init-protection.ts..." -ForegroundColor Yellow  
$initTest = & pnpm exec tsc server/_core/init-protection.ts --module NodeNext --target ES2020 2>&1
$exitInit = $LASTEXITCODE
Write-Host "Exit Code: $exitInit"
if ($initTest) {
    Write-Host "Output Lines: $(($initTest | Measure-Object).Count)"
    Write-Host "Primeiras linhas:"
    $initTest | Select-Object -First 5
} else {
    Write-Host "Sem output"
}
Write-Host ""

Write-Host "=== FIM DIAGNÓSTICO ===" -ForegroundColor Cyan
