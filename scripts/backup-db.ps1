# Script de backup do banco MySQL vendas_app
# Uso: .\backup-db.ps1

Write-Host "Iniciando backup do banco vendas_app..." -ForegroundColor Yellow

# Configurações
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backup_vendas_app_$timestamp.sql"
$mysqlPath = "C:\xampp\mysql\bin\mysqldump.exe"  # Ajuste conforme sua instalacao
$dbName = "vendas_app"
$dbUser = "root"

# Verificar se mysqldump existe
if (-not (Test-Path $mysqlPath)) {
    Write-Host "ERRO: mysqldump nao encontrado em: $mysqlPath" -ForegroundColor Red
    Write-Host "AJUSTE: Ajuste o caminho no script ou adicione ao PATH" -ForegroundColor Yellow
    exit 1
}

try {
    # Executar backup
    Write-Host "Criando backup: $backupFile" -ForegroundColor Green
    
    & $mysqlPath -u $dbUser -p $dbName > $backupFile
    
    if (Test-Path $backupFile) {
        $fileSize = (Get-Item $backupFile).Length / 1MB
        Write-Host "SUCESSO: Backup criado com sucesso!" -ForegroundColor Green
        Write-Host "Arquivo: $backupFile" -ForegroundColor Cyan
        Write-Host "Tamanho: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
    } else {
        Write-Host "ERRO: Falha ao criar backup" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERRO: Erro durante o backup: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "Backup concluido!" -ForegroundColor Green
