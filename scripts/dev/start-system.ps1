# Script para iniciar o sistema GRS ATUAL
# O servidor Express+Vite serve TUDO (API + frontend) na mesma porta - basta UMA janela!
Write-Host "Iniciando o sistema GRS ATUAL..." -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANTE: O servidor serve API e frontend juntos. Use apenas ESTA janela." -ForegroundColor Yellow
Write-Host "Apos iniciar, acesse: http://localhost:3000 (ou a porta que aparecer)" -ForegroundColor Green
Write-Host ""

pnpm run dev:windows