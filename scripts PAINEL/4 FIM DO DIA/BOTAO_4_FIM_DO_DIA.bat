@echo off
chcp 65001 >nul
setlocal
cd /d "C:\GRS ATUAL"

echo ============================
echo BOTAO 4 - FIM DO DIA
echo ============================

git branch --show-current
git status

echo.
echo [Banco] test:db (se MySQL estiver ligado)
npm run test:db

echo.
echo Se tiver mudanca pendente: rode o BOTAO 3.
pause