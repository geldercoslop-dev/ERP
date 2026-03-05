@echo off
chcp 65001 >nul
setlocal
cd /d "C:\GRS ATUAL"

echo =======================================
echo BOTAO 2 - RODAR SISTEMA + ABRIR NO CHROME
echo =======================================

echo Abrindo o servidor em outra janela...
start "GRS DEV SERVER" cmd /k "cd /d C:\GRS ATUAL && npm run dev"

echo Esperando o servidor subir...
timeout /t 3 >nul

echo Abrindo no navegador...
start "" "http://localhost:3003"

echo.
echo OK. (Deixe a janela "GRS DEV SERVER" aberta.)
pause