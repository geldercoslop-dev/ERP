@echo off
REM Preparar commit base: remover ZIP do Git, adicionar arquivos validos, commitar
cd /d "%~dp0\.."

echo Removendo arquivos .zip do versionamento (mantendo no disco)...
for /r %%f in (*.zip) do git rm --cached "%%f" 2>nul
git rm --cached "*.zip" 2>nul

echo Adicionando arquivos validos...
git add .

echo Criando commit base...
git commit -m "Base estável pós-hardening — sistema pronto para versionamento contínuo"

echo.
echo Status final:
git status
echo Branch atual:
git branch --show-current
pause
