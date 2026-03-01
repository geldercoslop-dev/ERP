@echo off
echo Verificando processos usando a porta 3001...

REM Encontrar o PID do processo usando a porta 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    set PID=%%a
    goto :found
)

:found
if "%PID%"=="" (
    echo Nenhum processo encontrado usando a porta 3001.
) else (
    echo Processo encontrado: PID %PID%
    echo Tentando encerrar o processo...
    taskkill /F /PID %PID%
    echo Processo encerrado.
)

echo.
echo Porta 3001 liberada. Agora você pode iniciar o sistema.
pause