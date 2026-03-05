@echo off
chcp 65001 >nul
setlocal
cd /d "C:\GRS ATUAL"

echo ============================
echo BOTAO 3 - COMMIT + PUSH (DEV)
echo ============================

git checkout dev
if errorlevel 1 ( echo ERRO: nao consegui ir para dev & pause & exit /b 1 )

git status
echo.
set /p MSG=Mensagem do commit (ex: "Tela X pronta"): 
if "%MSG%"=="" ( echo Cancelado (mensagem vazia) & pause & exit /b 1 )

git add .
if errorlevel 1 ( echo ERRO no git add & pause & exit /b 1 )

git commit -m "%MSG%"
if errorlevel 1 ( echo ERRO no commit (talvez nada para commitar) & pause & exit /b 1 )

git push
if errorlevel 1 ( echo ERRO no git push & pause & exit /b 1 )

echo OK.
pause