#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Script DevOps para inicializar infraestrutura (MySQL + Redis)
  
.DESCRIPTION
  Valida e sobe containers Docker com as configurações do projeto
  
.NOTES
  Requer Docker Desktop instalado e rodando
#>

param(
    [switch]$Force = $false,
    [switch]$SkipValidation = $false
)

$ErrorActionPreference = "Stop"

# ============================================================================
# CORES
# ============================================================================
$Colors = @{
    Success  = "`e[32m" # Verde
    Error    = "`e[31m" # Vermelho
    Warning  = "`e[33m" # Amarelo
    Info     = "`e[36m" # Cyan
    Reset    = "`e[0m"  # Reset
}

function Write-Success { Write-Host "$($Colors.Success)✅ $args$($Colors.Reset)" }
function Write-Error   { Write-Host "$($Colors.Error)❌ $args$($Colors.Reset)" }
function Write-Warning { Write-Host "$($Colors.Warning)⚠️  $args$($Colors.Reset)" }
function Write-Info    { Write-Host "$($Colors.Info)ℹ️  $args$($Colors.Reset)" }

# ============================================================================
# 1. VERIFICAR DOCKER
# ============================================================================
Write-Host ""
Write-Info "PASSO 1: Verificar Docker"
Write-Host "$($Colors.Info)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"

try {
    $dockerVersion = docker version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon não está respondendo"
    }
    Write-Success "Docker CLI encontrado"
} catch {
    Write-Error "Docker não está disponível"
    Write-Error "Erro: $_"
    Write-Error ""
    Write-Error "Solução: Inicie Docker Desktop e tente novamente"
    Write-Error "ou rode este script com Docker rodando:"
    Write-Error ""
    Write-Error "  docker-compose -f docker-compose.infra.yml up -d"
    Write-Error ""
    exit 1
}

# ============================================================================
# 2. LIMPAR CONTAINERS ANTIGOS (se --Force)
# ============================================================================
if ($Force) {
    Write-Host ""
    Write-Warning "PASSO 2: Limpando containers antigos (--Force)"
    Write-Host "$($Colors.Warning)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"
    
    try {
        docker stop vendas-mysql vendas-redis -f 2>$null | Out-Null
        docker rm vendas-mysql vendas-redis -f 2>$null | Out-Null
        Write-Success "Containers antigos removidos"
    } catch {
        Write-Warning "Nenhum container antigo para remover"
    }
} else {
    Write-Host ""
    Write-Info "PASSO 2: Verificar containers em execução"
    Write-Host "$($Colors.Info)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"
    
    $mysqlRunning = docker ps -q -f name=vendas-mysql 2>$null
    $redisRunning = docker ps -q -f name=vendas-redis 2>$null
    
    if ($mysqlRunning) {
        Write-Success "MySQL já está rodando (container: vendas-mysql)"
    } else {
        Write-Warning "MySQL não encontrado rodando"
    }
    
    if ($redisRunning) {
        Write-Success "Redis já está rodando (container: vendas-redis)"
    } else {
        Write-Warning "Redis não encontrado rodando"
    }
    
    if ($mysqlRunning -and $redisRunning) {
        Write-Info ""
        Write-Success "Infraestrutura já está online! Pulando inicialização..."
        Start-Sleep -Seconds 2
        exit 0
    }
}

# ============================================================================
# 3. INICIAR CONTAINERS
# ============================================================================
Write-Host ""
Write-Info "PASSO 3: Iniciar containers (Docker Compose)"
Write-Host "$($Colors.Info)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"

try {
    Write-Info "Subindo MySQL e Redis..."
    $result = docker-compose -f docker-compose.infra.yml up -d 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Containers iniciados com sucesso"
    } else {
        Write-Error "Erro ao iniciar containers"
        Write-Error $result
        exit 1
    }
} catch {
    Write-Error "Erro ao executar docker-compose: $_"
    exit 1
}

# ============================================================================
# 4. AGUARDAR SERVIÇOS FICAREM PRONTOS
# ============================================================================
Write-Host ""
Write-Info "PASSO 4: Aguardar serviços ficarem prontos"
Write-Host "$($Colors.Info)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"

$maxWaitTime = 60 # segundos
$startTime = Get-Date
$mysqlHealthy = $false
$redisHealthy = $false

while ((Get-Date) - $startTime -lt [timespan]::FromSeconds($maxWaitTime)) {
    # Check MySQL
    if (-not $mysqlHealthy) {
        try {
            $healthStatus = docker exec vendas-mysql mysqladmin ping -h localhost -u root -proot 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Success "MySQL está PRONTO"
                $mysqlHealthy = $true
            }
        } catch { }
    }
    
    # Check Redis
    if (-not $redisHealthy) {
        try {
            $healthStatus = docker exec vendas-redis redis-cli ping 2>$null
            if ($healthStatus -match "PONG") {
                Write-Success "Redis está PRONTO"
                $redisHealthy = $true
            }
        } catch { }
    }
    
    if ($mysqlHealthy -and $redisHealthy) {
        break
    }
    
    Write-Host "  ⏳ Aguardando... ($(([int](((Get-Date) - $startTime).TotalSeconds)))s)" -ForegroundColor Gray
    Start-Sleep -Seconds 3
}

if (-not ($mysqlHealthy -and $redisHealthy)) {
    Write-Error "Timeout ao aguardar serviços ficarem prontos"
    exit 1
}

# ============================================================================
# 5. VALIDAR CONECTIVIDADE
# ============================================================================
Write-Host ""
Write-Info "PASSO 5: Validar conectividade"
Write-Host "$($Colors.Info)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"

# Test MySQL
try {
    $test = docker exec vendas-mysql mysql -u vendas -pVendas_Prod_Secure2026 -D vendas_app -e "SELECT 1" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "MySQL conectado e database acessível"
    } else {
        throw "Não conseguiu conectar ao database"
    }
} catch {
    Write-Error "Erro ao testar MySQL: $_"
}

# Test Redis
try {
    $test = docker exec vendas-redis redis-cli SET test "ok" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Redis conectado"
    } else {
        throw "Não conseguiu escrever no Redis"
    }
} catch {
    Write-Error "Erro ao testar Redis: $_"
}

# ============================================================================
# 6. VALIDAR PORTAS
# ============================================================================
Write-Host ""
Write-Info "PASSO 6: Validar portas"
Write-Host "$($Colors.Info)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"

$ports = docker ps --format "table {{.Names}}\t{{.Ports}}" | Select-String "vendas-"

Write-Host ""
Write-Host $ports

Write-Host ""
Write-Success "INFRAESTRUTURA ONLINE!"
Write-Host ""
Write-Info "Detalhes:"
Write-Host "  • MySQL:  localhost:3306 (user: vendas)"
Write-Host "  • Redis:  localhost:6379"
Write-Host ""
Write-Info "Próximo passo:"
Write-Host "  pnpm run validate:final"
Write-Host ""
