# =============================================================================
# Executa drop-tenants-fks.sql no MySQL (resolve erro 1451 antes do drizzle push)
# Uso: .\run-drop-tenants-fks.ps1
#      Ou: $env:DB_USER="root"; $env:DB_PASSWORD=""; .\run-drop-tenants-fks.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
$SqlFile = Join-Path $ScriptDir "drop-tenants-fks.sql"

if (-not (Test-Path $SqlFile)) {
    Write-Error "Arquivo nao encontrado: $SqlFile"
    exit 1
}

# Carregar .env se existir (valores simples KEY=value)
$EnvFile = Join-Path $ProjectRoot ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"').Trim("'"), "Process")
        }
    }
}

# Config do banco (padrao XAMPP / projeto)
$dbHost = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "3306" }
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { "vendas" }
$dbPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "vendas123" }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "vendas_app" }

# DATABASE_URL tem precedencia (formato mysql://user:pass@host:3306/database)
if ($env:DATABASE_URL) {
    try {
        $url = [System.Uri]$env:DATABASE_URL
        $dbHost = $url.Host
        $dbPort = if ($url.Port -ne -1) { $url.Port } else { "3306" }
        $dbUser = $url.UserInfo.Split(":")[0]
        $dbPass = if ($url.UserInfo.Contains(":")) { $url.UserInfo.Substring($url.UserInfo.IndexOf(":") + 1) } else { "" }
        $dbName = $url.AbsolutePath.TrimStart("/")
    } catch {
        Write-Warning "DATABASE_URL invalida, usando padroes."
    }
}

# Onde esta o mysql (XAMPP ou PATH)
$mysqlExe = $env:MYSQL_CMD
if (-not $mysqlExe) {
    $xampp = "C:\xampp\mysql\bin\mysql.exe"
    if (Test-Path $xampp) { $mysqlExe = $xampp }
    else { $mysqlExe = "mysql" }
}

Write-Host "Conectando em ${dbUser}@${dbHost}:${dbPort}/${dbName} ..."
Write-Host "Executando: $SqlFile"
Write-Host ""

$env:MYSQL_PWD = $dbPass
try {
    Get-Content $SqlFile -Raw | & $mysqlExe -h $dbHost -P $dbPort -u $dbUser $dbName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host ""
    Write-Host "OK. Proximo passo: pnpm exec drizzle-kit push" -ForegroundColor Green
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
