@echo off
chcp 65001 >nul
setlocal

echo ==========================================================
echo ZIPAR sem node_modules + APAGAR pasta original (PERIGOSO)
echo ==========================================================
echo.
echo ATENCAO: isso APAGA a pasta original se o ZIP estiver OK.
echo.

set /p FOLDER=Digite o caminho completo da pasta para zipar e apagar (ex: C:\GRS ATUAL): 

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src='%FOLDER%';" ^
  "if(-not (Test-Path $src)){ Write-Host 'Pasta nao existe.'; exit 1 }" ^
  "if($src.Length -lt 6 -or $src -match '^[A-Za-z]:\\$'){ Write-Host 'Caminho perigoso. Abortando.'; exit 1 }" ^
  "if(-not (Test-Path (Join-Path $src 'package.json'))){ Write-Host 'Nao encontrei package.json na pasta. Abortando por seguranca.'; exit 1 }" ^
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
  "if(-not (Test-Path $zip)){ Write-Host 'ERRO: ZIP nao criado.'; exit 1 }" ^
  "if((Get-Item $zip).Length -le 1000){ Write-Host 'ERRO: ZIP muito pequeno. Abortando apagar.'; exit 1 }" ^
  "Write-Host 'ZIP OK. Apagando pasta original:' $src;" ^
  "Remove-Item -Recurse -Force $src;" ^
  "if(Test-Path $src){ Write-Host 'ERRO: nao consegui apagar a pasta.'; exit 1 }" ^
  "Write-Host 'OK. Pasta apagada. Ficou apenas o ZIP.'"

echo.
pause