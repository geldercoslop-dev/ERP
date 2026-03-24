@echo off
setlocal

echo ==============================
echo GERANDO ZIP LIMPO DO PROJETO
echo ==============================
echo.

set "PASTA_ATUAL=%CD%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i

set "DESKTOP=%USERPROFILE%\Desktop"
set "TMP=%DESKTOP%\TMP_ZIP_%TS%"

for %%F in ("%PASTA_ATUAL%") do set "NOME_PASTA=%%~nF"

set "ZIP=%DESKTOP%\%NOME_PASTA%_%TS%.zip"

echo Criando pasta temporaria...
powershell -NoProfile -Command "New-Item -ItemType Directory -Path '%TMP%' -Force | Out-Null"

echo Copiando arquivos...
robocopy "%PASTA_ATUAL%" "%TMP%" /E /XJ /XD node_modules .git dist build .next .cache coverage .turbo .vercel logs backups tmp temp .idea .vscode /XF .env* *.log *.sqlite *.db Thumbs.db Desktop.ini >nul

echo Gerando ZIP...
powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('%TMP%', '%ZIP%')"

echo Limpando temporarios...
powershell -NoProfile -Command "Remove-Item '%TMP%' -Recurse -Force"

echo.
echo ZIP criado:
echo %ZIP%
echo.
pause