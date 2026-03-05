@echo off
title GRS - Rodar Testes Core (ERRO ZERO)
cd /d "%~dp0.."
echo ========================================
echo   Testes de Nucleo (Estoque + Transacao + Diagnostico)
echo ========================================
echo.
echo Requer MySQL rodando (npm run test:db deve passar).
echo.
echo Rodando npm run test:core ...
call npm run test:core
if errorlevel 1 (
  echo [FALHA] test:core falhou. Verifique os erros acima.
  pause
  exit /b 1
)
echo.
echo Todos os testes passaram.
pause
