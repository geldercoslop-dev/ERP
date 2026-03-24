@echo off
echo Reiniciando completamente a aplicação...

echo 1. Parando todos os processos Node.js...
taskkill /f /im node.exe 2>nul

echo 2. Verificando se a porta 3001 está livre...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo Terminando processo %%a...
    taskkill /f /pid %%a 2>nul
)

echo 3. Limpando cache...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo Cache do Vite removido
)

echo 4. Definindo variáveis de ambiente...
set PORT=3001
set NODE_ENV=development

echo 5. Iniciando o servidor na porta 3001...
echo PORT=%PORT%
start cmd /c "npm run dev -- --port 3001"

echo 6. Aguardando o servidor iniciar (5 segundos)...
timeout /t 5

echo 7. Abrindo o navegador...
start http://localhost:3001/login

echo Reinicialização completa!