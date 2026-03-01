@echo off
echo Iniciando o servidor GRS ATUAL...

REM Iniciar o servidor
start cmd /k "pnpm run dev:windows"

REM Aguardar um pouco para o servidor iniciar e determinar a porta
timeout /t 10 /nobreak

REM Extrair a porta do arquivo port.ts
for /f "tokens=3 delims= " %%i in ('findstr /C:"export const PORT =" server\_core\port.ts') do (
    set PORT=%%i
    set PORT=!PORT:~0,-1!
    echo Porta encontrada: !PORT!
)

REM Iniciar o cliente com a porta correta
start cmd /k "cd client && set VITE_PORT=!PORT! && pnpm run dev"

echo Sistema iniciado. Acesse http://localhost:!PORT!/