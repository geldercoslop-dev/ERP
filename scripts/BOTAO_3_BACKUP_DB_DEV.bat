@echo off
title GRS - Backup do Banco (DEV)
cd /d "%~dp0.."
echo ========================================
echo   Backup do Banco de Desenvolvimento
echo ========================================
echo.
echo Se o mysqldump estiver no PATH (ex.: XAMPP\mysql\bin):
echo   mysqldump -u root -p vendas_app > backup_dev_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql
echo.
echo Se nao tiver mysqldump na linha de comando:
echo   1) Abra o phpMyAdmin (http://localhost/phpmyadmin)
echo   2) Selecione o banco vendas_app
echo   3) Aba "Exportar" - Exportar metodo rapido - SQL - Executar
echo   4) Guarde o arquivo .sql em pasta segura
echo.
set BACKUP_DIR=%~dp0..\backups
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set FNAME=%BACKUP_DIR%\vendas_app_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%.sql
set FNAME=%FNAME: =0%
where mysqldump >nul 2>nul
if errorlevel 1 (
  echo mysqldump nao encontrado no PATH. Use phpMyAdmin conforme acima.
  echo Pasta sugerida para salvar: %BACKUP_DIR%
  pause
  exit /b 0
)
echo Tentando backup com mysqldump...
echo Arquivo: %FNAME%
mysqldump -u root vendas_app > "%FNAME%" 2>nul
if errorlevel 1 (
  echo Falha. Tente com senha: mysqldump -u root -p vendas_app ^> "%FNAME%"
) else (
  echo Backup salvo em: %FNAME%
)
echo.
pause
