# SCRIPT DE INICIALIZACAO DO SISTEMA
# IMPORTANTE: Rode APENAS este script! 
# O backend ja inclui o frontend automaticamente!

Write-Host "SISTEMA DE VENDAS - INICIALIZADOR" -ForegroundColor Cyan
Write-Host ""

# Verifica se esta na pasta correta
if (-Not (Test-Path "client")) {
    Write-Host "ERRO: Execute este script na pasta raiz do projeto!" -ForegroundColor Red
    Write-Host "(A pasta deve conter a subpasta 'client')" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "Pasta correta encontrada!" -ForegroundColor Green
Write-Host ""

# Verifica dependencias
try {
    $pnpmVersion = pnpm --version
    Write-Host "pnpm v$pnpmVersion encontrado!" -ForegroundColor Green
} catch {
    Write-Host "ERRO: pnpm nao esta instalado!" -ForegroundColor Red
    Write-Host "Instale com: npm install -g pnpm" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host ""
Write-Host "VERIFICANDO DEPENDENCIAS" -ForegroundColor Yellow
Write-Host ""

# Instala dependencias
Write-Host "Instalando dependencias do projeto..." -ForegroundColor Cyan
npm install
Write-Host "Dependencias instaladas/atualizadas com sucesso!" -ForegroundColor Green
Write-Host ""

Write-Host "INSTRUCOES IMPORTANTES" -ForegroundColor Yellow
Write-Host ""
Write-Host "Este sistema roda BACKEND + FRONTEND JUNTOS!" -ForegroundColor Cyan
Write-Host "O backend automaticamente serve o frontend." -ForegroundColor Cyan
Write-Host ""
Write-Host "Iniciando servidor completo..." -ForegroundColor Yellow
Write-Host ""

# Define variaveis de ambiente
$env:NODE_ENV="development"
$env:PORT="3001"  # Garante que o servidor inicie na porta 3001

Write-Host "Iniciando sistema na porta 3001..." -ForegroundColor Green
Write-Host ""
Write-Host "Aguarde aparecer a mensagem:" -ForegroundColor Yellow
Write-Host "'Server running on http://localhost:3001/'" -ForegroundColor White
Write-Host ""
Write-Host "Depois acesse: http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "NAO feche esta janela enquanto usar o sistema!" -ForegroundColor Red
Write-Host ""

# Inicia o servidor na porta 3001
npx cross-env PORT=3001 tsx watch server/_core/index.ts