Write-Host "=== TESTE MÍNIMO TSC ===" -ForegroundColor Cyan

# Criar arquivo TS simples
@"
const hello: string = "world";
console.log(hello);
"@ | Out-File test-minimal.ts -Encoding UTF8

Write-Host "Criado test-minimal.ts"

# Tentar compilar
Write-Host "Executando: pnpm exec tsc test-minimal.ts --outDir test-out" -ForegroundColor Yellow
pnpm exec tsc test-minimal.ts --outDir test-out

# Verificar resultado
Write-Host "Verificando resultado..." -ForegroundColor Yellow
if (Test-Path test-out/test-minimal.js) {
    Write-Host "✅ SUCCESS: test-out/test-minimal.js exists" -ForegroundColor Green
    Get-Item test-out/test-minimal.js | Select-Object FullName, Length
    Write-Host "Conteúdo:" 
    Get-Content test-out/test-minimal.js
} else {
    Write-Host "❌ FAILED: test-out/test-minimal.js not found" -ForegroundColor Red
    Write-Host "Contents of test-out:" -ForegroundColor Yellow
    if (Test-Path test-out) {
        Get-ChildItem test-out -Recurse
    } else {
        Write-Host "  test-out directory doesn't exist"
    }
}
