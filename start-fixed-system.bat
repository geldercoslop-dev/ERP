@echo off
echo ===================================================
echo Iniciando sistema com correcoes aplicadas
echo ===================================================

echo.
echo 1. Verificando se o arquivo trpcClient.ts esta correto
node fix-trpc-client.mjs

echo.
echo 2. Definindo variaveis de ambiente
set NODE_ENV=development
set PORT=3001

echo.
echo 3. Iniciando o sistema na porta 3001
echo.
echo Aguarde aparecer a mensagem:
echo 'Server running on http://localhost:3001/'
echo.
echo Depois acesse: http://localhost:3001
echo.
echo NAO feche esta janela enquanto usar o sistema!
echo.

npx cross-env PORT=3001 tsx watch server/_core/index.ts