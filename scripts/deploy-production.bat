@echo off
REM Script de Deploy com Restart Automático - Produção (Windows)
REM Uso: scripts\deploy-production.bat

setlocal enabledelayedexpansion

echo 🚀 Iniciando deploy em produção...

REM Variáveis
set APP_NAME=erp-app
set BACKUP_DIR=.\backups
set LOGS_DIR=.\logs
set BUILD_DIR=.\dist

REM Criar diretórios necessários
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

echo 📦 Realizando backup do estado atual...

REM Backup do estado atual
set TIMESTAMP=%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_NAME=pre_deploy_%TIMESTAMP%

REM Parar aplicação atual
echo ⏹️ Parando aplicação atual...
pm2 stop "%APP_NAME%" >nul 2>&1 || echo ⚠️ Aplicação não estava rodando

REM Backup dos arquivos
if exist "%BUILD_DIR%" (
  tar -czf "%BACKUP_DIR%\%BACKUP_NAME%.tar.gz" "%BUILD_DIR%"
  echo ✅ Backup criado: %BACKUP_DIR%\%BACKUP_NAME%.tar.gz%
)

echo 🔨 Build da aplicação...

REM Limpar build anterior
if exist "%BUILD_DIR%" rmdir /s /q "%BUILD_DIR%"

REM Instalar dependências
echo 📥 Instalando dependências...
pnpm install --frozen-lockfile --prod

REM Build da aplicação
echo 🏗️ Build do frontend...
pnpm run build:client

echo 🏗️ Build do backend...
pnpm run build:server

echo 🧪 Verificando build...

REM Verificar se build foi bem sucedido
if not exist "%BUILD_DIR%\server\index.js" (
  echo ❌ Build falhou - arquivo principal não encontrado
  echo 🔄 Restaurando backup...
  tar -xzf "%BACKUP_DIR%\%BACKUP_NAME%.tar.gz"
  pm2 start "%APP_NAME%"
  exit /b 1
)

echo 🔍 Health check do build...

REM Teste rápido do build
timeout /t 10 /nobreak >nul
node "%BUILD_DIR%\server\index.js" --health-check >nul 2>&1 || (
  echo ❌ Health check falhou
  echo 🔄 Restaurando backup...
  tar -xzf "%BACKUP_DIR%\%BACKUP_NAME%.tar.gz"
  pm2 start "%APP_NAME%"
  exit /b 1
)

echo 🚀 Iniciando aplicação com PM2...

REM Iniciar com PM2
pm2 start ecosystem.config.production.json --env production

echo ⏳ Aguardando inicialização...

REM Aguardar aplicação iniciar
timeout /t 10 /nobreak >nul

REM Verificar se está rodando
pm2 list | findstr "%APP_NAME%" | findstr "online" >nul
if %errorlevel% equ 0 (
  echo ✅ Aplicação iniciada com sucesso
  
  REM Health check
  echo 🔍 Verificando saúde da aplicação...
  
  set /a count=0
  :health_loop
  set /a count+=1
  curl -f http://localhost:3000/health >nul 2>&1
  if %errorlevel% equ 0 (
    echo ✅ Health check passou
    goto health_success
  ) else (
    echo ⏳ Tentativa !count!/5 de health check...
    if !count! lss 5 (
      timeout /t 5 /nobreak >nul
      goto health_loop
    )
  )
  
  :health_success
  
  REM Limpar backups antigos (manter últimos 5)
  echo 🧹 Limpando backups antigos...
  for /f "skip=5 delims=" %%F in ('dir "%BACKUP_DIR%\pre_deploy_*.tar.gz" /b /o-d') do del "%BACKUP_DIR%\%%F"
  
  echo 🎉 Deploy concluído com sucesso!
  echo 📊 Status:
  pm2 status "%APP_NAME%"
  
) else (
  echo ❌ Falha ao iniciar aplicação
  echo 🔄 Restaurando backup...
  tar -xzf "%BACKUP_DIR%\%BACKUP_NAME%.tar.gz"
  pm2 start "%APP_NAME%"
  exit /b 1
)

echo 📈 Logs recentes:
pm2 logs "%APP_NAME%" --lines 20 --nostream
