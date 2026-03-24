@echo off
echo ===================================================
echo Corrigindo problemas de seguranca e dependencias
echo ===================================================

echo.
echo 1. Corrigindo problema de sintaxe no trpcClient.ts
node fix-trpc-client.mjs

echo.
echo 2. Instalando dependencias atualizadas
npm install

echo.
echo 3. Verificando e corrigindo vulnerabilidades
node fix-vulnerabilities.mjs

echo.
echo Processo concluido! Agora tente iniciar o sistema novamente.
echo.
pause