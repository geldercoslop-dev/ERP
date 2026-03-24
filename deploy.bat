@echo off
REM Deploy Script for ERP Application (Windows)
REM Usage: deploy.bat [development|production]

setlocal enabledelayedexpansion

set ENVIRONMENT=%1%
if "%ENVIRONMENT%"=="" set ENVIRONMENT=production
set APP_NAME=erp-app
set BACKUP_DIR=./backups
set LOG_DIR=./logs

echo 🚀 Starting deployment for %ENVIRONMENT% environment...

REM Create necessary directories
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Function to backup current deployment
echo 📦 Backing up current deployment...
pm2 list | findstr "%APP_NAME%" >nul
if !errorlevel! equ 0 (
    set TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
    set TIMESTAMP=!TIMESTAMP: =0!
    pm2 dump "%BACKUP_DIR%\pm2-backup-!TIMESTAMP!.dump"
)

REM Function to install dependencies
echo 📦 Installing dependencies...
pnpm install --frozen-lockfile --prod

REM Function to build application
echo 🔨 Building application...
pnpm run build:client
pnpm run build:server

REM Verify build
if not exist "dist\client" (
    echo ❌ Build failed - missing client directory
    exit /b 1
)
if not exist "dist\server" (
    echo ❌ Build failed - missing server directory
    exit /b 1
)

REM Function to run tests
echo 🧪 Running tests...
pnpm run check:server
pnpm test

REM Function to deploy with PM2
echo 🔄 Deploying with PM2...

REM Stop existing processes
pm2 stop %APP_NAME% >nul 2>&1
pm2 delete %APP_NAME% >nul 2>&1

REM Start new process
if "%ENVIRONMENT%"=="development" (
    pm2 start ecosystem.config.json --env development --name %APP_NAME%
) else (
    pm2 start ecosystem.config.json --env production --name %APP_NAME%
)

REM Save PM2 configuration
pm2 save

REM Generate startup script
pm2 startup

REM Function to health check
echo 🏥 Running health check...
timeout /t 5 /nobreak >nul

REM Check PM2 status
pm2 status

REM Check application health
set /a counter=0
:health_loop
set /a counter+=1
curl -f http://localhost:3000/health >nul 2>&1
if !errorlevel! equ 0 (
    echo ✅ Health check passed
    goto health_success
)

if !counter! lss 10 (
    echo ⏳ Waiting for application to start... (!counter!/10)
    timeout /t 3 /nobreak >nul
    goto health_loop
)

echo ❌ Health check failed
pm2 logs %APP_NAME% --lines 20
exit /b 1

:health_success
echo ✅ Deployment completed successfully!
echo 📊 Application status:
pm2 status
echo 📋 Recent logs:
pm2 logs %APP_NAME% --lines 5

endlocal
