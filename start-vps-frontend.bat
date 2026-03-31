@echo off
REM ========================================================================
REM SCRIPT: Subir Frontend + Conectar Backend Real VPS
REM Uso: Execute este arquivo (duplo clique ou: start-vps-frontend.bat)
REM ========================================================================

setlocal enabledelayedexpansion

REM Cores (usando PowerShell inline para output colorido)
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║          SUBIR FRONTEND + BACKEND REAL (VPS) - Setup           ║
echo ║              Teste Integração Frontend-Backend                 ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Verificar se Node.js está instalado
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js não encontrado
    echo   Instale de: https://nodejs.org/
    pause
    exit /b 1
)

REM Verificar se npm/pnpm está instalado
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ NPM não encontrado
    pause
    exit /b 1
)

REM Mudar para diretório do projeto
cd /d c:\ERP
if %ERRORLEVEL% neq 0 (
    echo ❌ Erro ao mudar para diretório c:\ERP
    pause
    exit /b 1
)

echo ✅ Node: & node --version
echo ✅ NPM: & npm --version
echo ✅ PWD: %cd%
echo.

REM ========================================================================
REM FASE 1: Subir Frontend Vite
REM ========================================================================

echo.
echo [FASE 1] Iniciando Frontend Vite na porta 5173...
echo.

setlocal enabledelayedexpansion

REM Verificar se node_modules existe
if not exist "client\node_modules" (
    echo ⚠️  node_modules não encontrado, instalando dependências...
    cd client
    call npm install
    cd ..
)

REM Iniciar Vite
echo 🔨 Iniciando: npm run dev:client
cd client
call npm run dev:client
