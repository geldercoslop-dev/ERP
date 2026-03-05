@echo off
chcp 65001 >nul
setlocal
cd /d "C:\GRS ATUAL"

echo =====================================
echo ZIPAR pasta sem node_modules (NAO APAGA)
echo =====================================

set /p FOLDER=Digite o caminho completo da pasta para zipar (ex: C:\GRS ATUAL): 

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src='%FOLDER%';" ^
  "if(-not (Test-Path $src)){ Write-Host 'Pasta nao existe.'; exit 1 }" ^
  "$name = Split-Path $src -Leaf;" ^
  "$parent = Split-Path $src -Parent;" ^
  "$zip = Join-Path $parent ($name + '_SEM_NODEMODULES_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.zip');" ^
  "Write-Host 'Criando ZIP:' $zip;" ^
  "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
  "$tmp = Join-Path $env:TEMP ('ziptmp_' + [guid]::NewGuid().ToString());" ^
  "New-Item -ItemType Directory -Path $tmp | Out-Null;" ^
  "robocopy $src $tmp /MIR /XD node_modules .git dist build .next .turbo .cache /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null;" ^
  "[System.IO.Compression.ZipFile]::CreateFromDirectory($tmp, $zip);" ^
  "Remove-Item -Recurse -Force $tmp;" ^
  "if((Test-Path $zip) -and ((Get-Item $zip).Length -gt 1000)){ Write-Host 'OK: ZIP criado.' } else { Write-Host 'ERRO: ZIP nao foi criado corretamente.'; exit 1 }"

echo.
pause