
Write-Host "Iniciando o servidor GRS ATUAL..." -ForegroundColor Cyan

# Iniciar o servidor diretamente (sem novo processo)
Write-Host "Iniciando o servidor..." -ForegroundColor Yellow
pnpm run dev:windows

# O script não precisa continuar, pois o servidor já está rodando
# Se você quiser iniciar o cliente também, abra outro terminal e execute:
# cd client && pnpm run dev