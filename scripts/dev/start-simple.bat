@echo off
echo Iniciando sistema na porta 3001...
set NODE_ENV=development
set PORT=3001
npx cross-env PORT=3001 tsx watch server/_core/index.ts