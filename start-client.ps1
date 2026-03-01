# AVISO: Neste projeto, o servidor (pnpm run dev) ja serve o frontend na mesma porta.
# Use start-system.ps1 ou start-dev.ps1 - NAO precisa rodar cliente separado!
# Este script existe apenas para casos especiais (ex: cliente em outra maquina).

# Extrair a porta do arquivo port.ts
$portFile = Get-Content -Path ".\server\_core\port.ts"
$portLine = $portFile | Where-Object { $_ -match "export const PORT = (\d+);" }
if ($portLine -match "export const PORT = (\d+);") {
    $port = $matches[1]
    Write-Host "Porta encontrada: $port" -ForegroundColor Green
    
    # Definir a variável de ambiente VITE_PORT e VITE_TRPC_URL
    $env:VITE_PORT = $port
    $env:VITE_TRPC_URL = "http://localhost:$port/api/trpc"
    
    # Iniciar o cliente
    Write-Host "Iniciando o cliente na porta $port..." -ForegroundColor Cyan
    Write-Host "URL da API configurada: $env:VITE_TRPC_URL" -ForegroundColor Cyan
    Set-Location -Path ".\client"
    pnpm run dev
    
} else {
    Write-Host "Não foi possível determinar a porta. Verifique o arquivo server\_core\port.ts" -ForegroundColor Red
    Write-Host "Iniciando o cliente na porta padrão 3003..." -ForegroundColor Yellow
    
    # Usar porta padrão
    $env:VITE_PORT = 3003
    $env:VITE_TRPC_URL = "http://localhost:3003/api/trpc"
    
    # Iniciar o cliente
    Write-Host "URL da API configurada: $env:VITE_TRPC_URL" -ForegroundColor Cyan
    Set-Location -Path ".\client"
    pnpm run dev
}