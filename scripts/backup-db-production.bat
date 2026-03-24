@echo off
REM Backup Diário do ERP - Produção (Windows)
REM Uso: scripts\backup-db-production.bat

setlocal enabledelayedexpansion

REM Configurações
set BACKUP_DIR=.\backups
set TIMESTAMP=%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=erp_backup_%TIMESTAMP%.sql
set RETENTION_DAYS=30

REM Criar diretório de backup
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo 🔄 Iniciando backup do banco de dados...
echo 📅 Data/Hora: %date% %time%
echo 📁 Arquivo: %BACKUP_FILE%

REM Backup do banco
mysqldump ^
  --host=%DATABASE_HOST% ^
  --port=%DATABASE_PORT% ^
  --user=%DATABASE_USER% ^
  --password=%DATABASE_PASSWORD% ^
  --single-transaction ^
  --routines ^
  --triggers ^
  --events ^
  --quick ^
  --lock-tables=false ^
  %DATABASE_NAME% > "%BACKUP_DIR%\%BACKUP_FILE%"

REM Comprimir backup
gzip "%BACKUP_DIR%\%BACKUP_FILE%"

echo ✅ Backup concluído: %BACKUP_FILE%.gz

REM Limpar backups antigos (usando PowerShell)
powershell -Command "Get-ChildItem '%BACKUP_DIR%\erp_backup_*.sql.gz' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-%RETENTION_DAYS%) | Remove-Item -Force"

echo 🧹 Limpeza de backups antigos concluída

REM Verificar tamanho
for %%F in ("%BACKUP_DIR%\%BACKUP_FILE%.gz") do set BACKUP_SIZE=%%~zF
set /a BACKUP_SIZE_MB=%BACKUP_SIZE%/1048576
echo 📊 Tamanho do backup: %BACKUP_SIZE_MB% MB

echo 🎉 Backup finalizado com sucesso!
