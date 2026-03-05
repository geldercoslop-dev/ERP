@echo off
title GRS - Testar Saude do Sistema
cd /d "%~dp0.."
echo ========================================
echo   Teste de Saude (DB + Health)
echo ========================================
echo.
echo 1) Testando conexao com o banco (test:db)...
call npm run test:db
if errorlevel 1 (
  echo [FALHA] test:db falhou. Verifique se o MySQL/XAMPP esta ligado.
  pause
  exit /b 1
)
echo.
echo 2) Verificando banco (check:db)...
call npm run check:db
if errorlevel 1 (
  echo [FALHA] check:db falhou.
  pause
  exit /b 1
)
echo.
echo 3) Se o servidor estiver rodando, teste o health:
echo    Abra no navegador: http://localhost:3003/api/health
echo    Ou rode: curl -s http://localhost:3003/api/health
echo.
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3003/api/health' -UseBasicParsing -TimeoutSec 3; Write-Host 'Health OK:'; $r.Content } catch { Write-Host 'Servidor nao respondeu (inicie com BOTAO_1 ou npm run dev).' }"
echo.
pause
