@echo off
chcp 65001 >nul
title Sistema de Vendas - Inicializador

echo ╔════════════════════════════════════════╗
echo ║   SISTEMA DE VENDAS - INICIALIZADOR    ║
echo ╚════════════════════════════════════════╝
echo.

:: Verifica pasta client
if not exist "client" (
    echo ❌ ERRO: Execute este script na pasta raiz do projeto!
    echo    A pasta deve conter a subpasta 'client'
    pause
    exit /b 1
)

echo ✅ Pasta correta encontrada!
echo.

:: Verifica pnpm
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERRO: pnpm não está instalado!
    echo    Instale com: npm install -g pnpm
    pause
    exit /b 1
)

echo ✅ pnpm encontrado!
echo.

echo ╔════════════════════════════════════════╗
echo ║        ⚠️  INSTRUÇÕES IMPORTANTES       ║
echo ╚════════════════════════════════════════╝
echo.
echo Este sistema roda BACKEND + FRONTEND JUNTOS!
echo O backend automaticamente serve o frontend.
echo.

:: Define variável de ambiente
set NODE_ENV=development

echo 🔧 Iniciando servidor completo...
echo.
echo 🚀 Iniciando sistema na porta 3000...
echo.
echo ⏳ Aguarde aparecer a mensagem:
echo    'Server running on http://localhost:3000/'
echo.
echo 🌐 Depois acesse: http://localhost:3000
echo.
echo ⚠️  NÃO feche esta janela enquanto usar o sistema!
echo.
echo ═══════════════════════════════════════════
echo.

:: Inicia o servidor
npx tsx watch server/_core/index.ts
