@echo off
echo Forçando o uso da porta 3001...

REM Parar todos os processos Node.js
echo Parando todos os processos Node.js...
taskkill /f /im node.exe

REM Aguardar um momento
timeout /t 2

REM Verificar se a porta 3001 está livre
echo Verificando se a porta 3001 está livre...
netstat -ano | findstr :3001
if %errorlevel% equ 0 (
    echo AVISO: A porta 3001 ainda está em uso. Tentando liberar...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
        echo Terminando processo %%a...
        taskkill /f /pid %%a
    )
    timeout /t 2
)

REM Iniciar o servidor na porta 3001
echo Iniciando servidor na porta 3001...
set PORT=3001
echo PORT=%PORT%
npm run dev