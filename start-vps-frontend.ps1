# ════════════════════════════════════════════════════════════════════════════
# SETUP FRONTEND + BACKEND VPS - PowerShell
# ════════════════════════════════════════════════════════════════════════════
# 
# 📌 INSTRUÇÕES:
#
#   1. Edite as variáveis abaixo com suas informações de VPS
#   2. Execute este script: . .\start-vps-frontend.ps1
#   3. Verifique a porta 5173 no navegador: http://localhost:5173
#
# ════════════════════════════════════════════════════════════════════════════

# ⚠️ CONFIGURATION - EDITE AQUI COM SUA VPS
# ════════════════════════════════════════════════════════════════════════════

$VPS_IP = "192.168.1.100"          # ← ALTERE COM IP DA VPS
$VPS_PORT = "3000"                 # ← Porta do backend (geralmente 3000)
$VPS_PROTOCOL = "http"             # ← http ou https
$USE_PROXY = $true                 # ← Usar proxy Vite? (mais seguro)

# Se usar HTTPS, poderia ser:
# $VPS_PROTOCOL = "https"
# $VPS_URL = "https://api.seudominio.com"

$VPS_URL = "$VPS_PROTOCOL`://$VPS_IP`:$VPS_PORT"
$FRONTEND_PORT = "5173"
$FRONTEND_URL = "http://localhost:$FRONTEND_PORT"

# ════════════════════════════════════════════════════════════════════════════
# LOGS E FORMATO
# ════════════════════════════════════════════════════════════════════════════

function Write-Section {
    param([string]$Title)
    Write-Host "`n╔$('═' * 68)╗" -ForegroundColor Cyan
    Write-Host "║  $Title.PadRight(67) ║" -ForegroundColor Cyan
    Write-Host "╚$('═' * 68)╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "  ❌ $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "  ⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "  ℹ️  $Message" -ForegroundColor Cyan
}

# ════════════════════════════════════════════════════════════════════════════
# VALIDAÇÃO PRÉ-REQUISITOS
# ════════════════════════════════════════════════════════════════════════════

Write-Section "VALIDAÇÃO DE PRÉ-REQUISITOS"

# Verificar Node.js
$nodeVersion = node --version
if ($LASTEXITCODE -eq 0) {
    Write-Success "Node.js $nodeVersion"
} else {
    Write-Error "Node.js não encontrado"
    Write-Error "Instale de: https://nodejs.org/"
    exit 1
}

# Verificar npm
$npmVersion = npm --version
if ($LASTEXITCODE -eq 0) {
    Write-Success "npm $npmVersion"
} else {
    Write-Error "npm não encontrado"
    exit 1
}

# Verificar diretório
$projectPath = "C:\ERP"
if (Test-Path $projectPath) {
    Write-Success "Diretório do projeto: $projectPath"
    Set-Location $projectPath
} else {
    Write-Error "Diretório não encontrado: $projectPath"
    exit 1
}

# ════════════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO DO BACKEND VPS
# ════════════════════════════════════════════════════════════════════════════

Write-Section "CONFIGURAÇÃO DO BACKEND VPS"

Write-Info "VPS URL Configurada: $VPS_URL"
Write-Info "Frontend URL: $FRONTEND_URL"
Write-Info "Porta Frontend: $FRONTEND_PORT"
Write-Info "Usando Proxy Vite: $USE_PROXY"

# Se usar proxy, editar vite.config.ts
if ($USE_PROXY) {
    Write-Info "Atualizando proxy em vite.config.ts..."
    Write-Warning "⚠️ Certifique-se de que vite.config.ts tem o target correto:"
    Write-Host "`n    target: '$VPS_URL',  // ← Deve estar assim`n" -ForegroundColor Yellow
}

# ════════════════════════════════════════════════════════════════════════════
# INSTALAR DEPENDÊNCIAS
# ════════════════════════════════════════════════════════════════════════════

Write-Section "INSTALAR DEPENDÊNCIAS"

Set-Location "client"
if (-not (Test-Path "node_modules")) {
    Write-Info "node_modules não encontrado, instalando..."
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Erro ao instalar dependências"
        exit 1
    }
    Write-Success "Dependências instaladas"
} else {
    Write-Success "node_modules já existe"
}

# ════════════════════════════════════════════════════════════════════════════
# TESTES PRÉ-LAUNCH
# ════════════════════════════════════════════════════════════════════════════

Write-Section "VERIFICAÇÕES PRÉ-LAUNCH"

# Verificar se porta está livre
$portProc = netstat -aon 2>$null | Select-String ":$FRONTEND_PORT"
if ($portProc) {
    Write-Warning "Porta $FRONTEND_PORT pode estar em uso"
    Write-Warning "Matando processo anterior se necessário..."
    $pid = $portProc -split '\s+' | Select-Object -Last 1
    if ($pid) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Success "Porta $FRONTEND_PORT liberada"
    }
}

# ════════════════════════════════════════════════════════════════════════════
# INICIAR VITE DEV SERVER
# ════════════════════════════════════════════════════════════════════════════

Write-Section "INICIANDO FRONTEND VITE"

Write-Success "Iniciando servidor em $FRONTEND_URL"
Write-Info "Este terminal ficará ocupado enquanto o Vite rodar"
Write-Info "Pressione Ctrl+C para parar"
Write-Host "`n$COLORS.CYAN"

# Iniciar Vite
& npm run dev

# Se chegou aqui, Vite foi parado
Write-Section "SERVIDOR PARADO"
Write-Info "Vite foi encerrado"
