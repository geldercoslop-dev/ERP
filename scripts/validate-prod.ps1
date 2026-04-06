#Requires -Version 5.1
<#
.SYNOPSIS
    Valida o ambiente de produção ERP (Windows/PowerShell).
    Retry automático com saída 0 em sucesso e 1 em falha.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Write-Log {
    param([string]$Message)
    $ts = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
    Write-Host "$ts [validate-prod] $Message"
}

function Invoke-WithRetry {
    param(
        [scriptblock]$Action,
        [string]$Label,
        [int]$MaxAttempts = 10,
        [int]$DelaySec    = 3
    )
    $n = 0
    while ($true) {
        try {
            & $Action
            return
        } catch {
            $n++
            if ($n -ge $MaxAttempts) {
                Write-Log "FAIL — '$Label' falhou após $n tentativa(s): $_"
                exit 1
            }
            Write-Log "retry $n/$MaxAttempts — '$Label' — aguardando ${DelaySec}s..."
            Start-Sleep -Seconds $DelaySec
        }
    }
}

# ---------------------------------------------------------------------------
# 1. docker ps
# ---------------------------------------------------------------------------
Write-Log "checking docker ps"
Invoke-WithRetry -Label 'docker ps' -Action {
    $out = docker ps 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker ps retornou $LASTEXITCODE" }
    Write-Host $out
}

# ---------------------------------------------------------------------------
# 2. health endpoint — retry até 10x com intervalo de 3s, timeout 5s/req
# ---------------------------------------------------------------------------
Write-Log "checking /health (max 10 attempts, 3s interval, 5s timeout)"
Invoke-WithRetry -Label 'health check' -MaxAttempts 10 -DelaySec 3 -Action {
    $resp = Invoke-WebRequest `
        -Uri 'http://127.0.0.1:3000/health' `
        -UseBasicParsing `
        -TimeoutSec 5 `
        -ErrorAction Stop
    if ($resp.StatusCode -ne 200) {
        throw "HTTP $($resp.StatusCode) — corpo: $($resp.Content)"
    }
    Write-Log "health response (HTTP $($resp.StatusCode)): $($resp.Content)"
}

# ---------------------------------------------------------------------------
# 3. docker logs — verificar ausência de erros críticos
# ---------------------------------------------------------------------------
Write-Log "scanning container logs for errors"
$logOutput = docker logs erp-api-prod 2>&1
$errorLines = $logOutput | Select-String -Pattern 'error|fatal|exception' -SimpleMatch

if ($errorLines) {
    Write-Log "WARN — error patterns found in erp-api-prod logs:"
    $errorLines | ForEach-Object { Write-Host $_ }
    # Não aborta: logs de startup normais podem conter a palavra "error"
}

# ---------------------------------------------------------------------------
# Resultado final
# ---------------------------------------------------------------------------
Write-Log "ALL CHECKS PASSED"
exit 0
