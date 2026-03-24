@echo off
REM Script para executar testes reais de consistência do banco (Windows)

setlocal enabledelayedexpansion

echo.
echo 🚀 INICIANDO TESTES DE CONSISTENCIA DO BANCO
echo =============================================
echo.

REM Validar se .env.local existe
if not exist ".env.local" (
  echo ⚠️  AVISO: .env.local não encontrado
  echo    Usando variáveis de ambiente padrão
  echo.
)

REM Compilar TypeScript do teste se necessário
echo 📝 Compilando testes...
call npx tsc server\tests\database-consistency.test.ts --skipLibCheck 2>nul

REM Executar teste
echo.
echo 🧪 Executando testes de consistência...
echo.

node --require ts-node/register ^
  --require dotenv/config ^
  server\tests\database-consistency.test.ts

set TEST_EXIT_CODE=%ERRORLEVEL%

echo.
echo =============================================
if %TEST_EXIT_CODE% equ 0 (
  echo ✅ TESTES PASSARAM
) else (
  echo ❌ TESTES FALHARAM ^(exit code: %TEST_EXIT_CODE%^)
)
echo =============================================
echo.

exit /b %TEST_EXIT_CODE%
