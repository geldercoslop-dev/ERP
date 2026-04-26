@echo off
REM SAFE GENERATE - Wrapper seguro para drizzle-kit generate
REM Este script garante que generate só rode com intenção explícita

echo 🔒 SAFE GENERATE - Drizzle Kit Generate Wrapper
echo ==============================================
echo.
echo ⚠️  Você está prestes a gerar uma nova migration.
echo.
echo Verifique:
echo 1. Você tem intenção explícita de alterar o schema?
echo 2. Você leu BASELINE_LOCKED.md?
echo 3. Você revisou as mudanças no schema.ts?
echo.
set /p confirm="Continuar? (s/N): "

if /i not "%confirm%"=="s" (
    echo ❌ Cancelado pelo usuário.
    exit /b 1
)

echo.
echo ✅ Executando drizzle-kit generate...
npx drizzle-kit generate

echo.
echo ==============================================
echo ⚠️  PRÓXIMOS PASSOS:
echo 1. Revise o SQL gerado em drizzle\*.sql
echo 2. Teste em ambiente de dev
echo 3. Aplique com: npx drizzle-kit migrate
echo 4. Atualize drizzle\BASELINE_LOCKED.md
echo ==============================================
