@echo off
echo Reiniciando servidor e limpando cookies...

REM Parar o servidor atual (se estiver rodando)
taskkill /f /im node.exe

REM Aguardar um momento
timeout /t 2

REM Iniciar o servidor na porta 3001
set PORT=3001
echo PORT=%PORT%
npm run dev -- --port 3001