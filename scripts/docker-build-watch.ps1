param(
  [string]$ComposeFile = "docker-compose.prod.yml",
  [int]$PollSeconds = 5,
  [int]$TimeoutSeconds = 600,
  [string]$LogFile = "scripts\\docker-build-watch.log"
)

$ErrorActionPreference = "Stop"

function Write-ProgressLine([string]$msg) {
  $ts = (Get-Date).ToString("s")
  Write-Host "[$ts] $msg"
}

function Read-Tail([string]$path, [int]$lines = 60) {
  if (!(Test-Path $path)) { return @() }
  try {
    return Get-Content $path -Tail $lines -ErrorAction Stop
  } catch {
    return @()
  }
}

$logOut = $LogFile
$logErr = "$LogFile.err"

# Reset log files
New-Item -ItemType Directory -Force -Path (Split-Path $logOut) | Out-Null
Remove-Item -Force -ErrorAction SilentlyContinue $logOut
Remove-Item -Force -ErrorAction SilentlyContinue $logErr
New-Item -ItemType File -Force -Path $logOut | Out-Null
New-Item -ItemType File -Force -Path $logErr | Out-Null

Write-ProgressLine "Iniciando build: docker compose -f $ComposeFile build --no-cache"
Write-ProgressLine "Logs: $logOut + $logErr"

$proc = Start-Process -FilePath "docker" `
  -ArgumentList @("compose","-f",$ComposeFile,"build","--no-cache") `
  -NoNewWindow `
  -PassThru `
  -RedirectStandardOutput $logOut `
  -RedirectStandardError $logErr

$started = Get-Date
$lastFingerprint = ""
$donePatterns = @(
  "(?i)\\b(success|succeeded|done)\\b",
  "(?i)\\b(error|failed|fatal)\\b",
  "(?i)\\b(exporting to image|naming to|unpacking)\\b"
)

while ($true) {
  $elapsed = (New-TimeSpan -Start $started -End (Get-Date)).TotalSeconds
  if ($elapsed -ge $TimeoutSeconds) {
    Write-ProgressLine "TIMEOUT (${TimeoutSeconds}s). Encerrando processo do build..."
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
    exit 1
  }

  $tail = @()
  $tail += Read-Tail -path $logOut -lines 40
  $tail += Read-Tail -path $logErr -lines 40
  if ($tail.Count -gt 0) {
    $fingerprint = ($tail -join "`n").GetHashCode().ToString()
    if ($fingerprint -ne $lastFingerprint) {
      $lastFingerprint = $fingerprint
      Write-ProgressLine "Progresso (últimas linhas):"
      $tail | ForEach-Object { Write-Host $_ }
    }

    foreach ($p in $donePatterns) {
      if (($tail -join "`n") -match $p) {
        # Não assumimos sucesso/erro só pelo match, apenas usamos como “marcador” para checar o estado do processo.
        break
      }
    }
  }

  if ($proc.HasExited) {
    Write-ProgressLine "Processo terminou. ExitCode=$($proc.ExitCode)"
    if ($proc.ExitCode -eq 0) {
      Write-ProgressLine "BUILD OK"
      exit 0
    }
    Write-ProgressLine "BUILD FALHOU"
    exit $proc.ExitCode
  }

  Start-Sleep -Seconds $PollSeconds
}

