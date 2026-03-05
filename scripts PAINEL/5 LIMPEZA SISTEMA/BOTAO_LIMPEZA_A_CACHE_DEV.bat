@echo off
chcp 65001 >nul
setlocal
cd /d "C:\GRS ATUAL"

echo =====================================
echo LIMPEZA A - CACHE DEV (Vite/Node)
echo =====================================

echo Feche o "npm run dev" antes.
echo.

if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"
if exist "client\node_modules\.vite" rmdir /s /q "client\node_modules\.vite"
if exist "dist" rmdir /s /q "dist"
if exist "build" rmdir /s /q "build"

npm cache verify

echo OK. Agora rode o BOTAO 2.
pause