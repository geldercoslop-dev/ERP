@echo off
title GRS - Iniciar DEV
echo ========================================
echo   GRS - Ambiente de Desenvolvimento
echo ========================================
echo.
echo Certifique-se de que o XAMPP/MySQL esta rodando (porta 3306).
echo.
cd /d "%~dp0.."
echo Pasta: %CD%
echo.
echo Comandos uteis (rode em outro terminal se precisar):
echo   npm run check:db   - testar conexao MySQL
echo   npm run test:db    - outro teste de conexao
echo   npm run check      - verificar TypeScript
echo.
echo Iniciando servidor (npm run dev)...
echo.
start "" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
echo Abrindo navegador em http://localhost:3000 ...
start http://localhost:3000
echo.
pause
