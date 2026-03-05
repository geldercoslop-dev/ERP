@echo off
chcp 65001 >nul
setlocal
cd /d "C:\GRS ATUAL"

echo ==============================
echo BOTAO 1 - INICIO DO DIA (DEV)
echo ==============================

git checkout dev
if errorlevel 1 ( echo ERRO: git checkout dev falhou & pause & exit /b 1 )

git status

echo.
echo [Banco] (Precisa XAMPP/MySQL ligado)
npm run test:db
if errorlevel 1 ( echo ERRO: test:db falhou. Ligue MySQL no XAMPP. & pause & exit /b 1 )

npm run check:db
if errorlevel 1 ( echo ERRO: check:db falhou. Normalmente MySQL/.env. & pause & exit /b 1 )

echo.
echo OK. Agora use o BOTAO 2.
pause