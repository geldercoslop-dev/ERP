@echo off
title GRS - Commit e Push (branch dev)
cd /d "%~dp0.."
echo ========================================
echo   Git - Commit e Push
echo ========================================
echo.
echo Certifique-se de estar no branch dev e com mensagem clara.
echo.
git status
echo.
set /p MSG="Digite a mensagem do commit (ex: Tela X pronta): "
if "%MSG%"=="" (
  echo Mensagem vazia. Abortando.
  pause
  exit /b 1
)
echo.
echo Executando: git add .
git add .
echo Executando: git commit -m "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
  echo Nenhuma alteracao para commitar ou erro no commit.
  pause
  exit /b 1
)
echo.
echo Executando: git push
git push
if errorlevel 1 (
  echo Push falhou. Verifique remoto (origin) e branch.
  pause
  exit /b 1
)
echo.
echo Commit e push concluidos.
pause
