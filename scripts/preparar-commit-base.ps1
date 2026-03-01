# Script: preparar commit base estavel (remover ZIP do versionamento, adicionar arquivos validos, commitar)
# Executar na pasta do projeto: powershell -ExecutionPolicy Bypass -File scripts/preparar-commit-base.ps1

Set-Location $PSScriptRoot\..

# Remover ZIP do controle do Git (mantem no disco)
Get-ChildItem -Recurse -Filter "*.zip" -ErrorAction SilentlyContinue | ForEach-Object {
    $rel = $_.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
    git rm --cached $rel 2>$null
}
git rm --cached "*.zip" 2>$null

# Staging de todos os arquivos validos (.gitignore ja exclui node_modules, .env, etc.)
git add .

# Verificar se .env ou node_modules estao no staging (nao devem)
$staged = git diff --cached --name-only
if ($staged -match "\.env$|^node_modules/") {
    Write-Host "AVISO: .env ou node_modules apareceram no staging. Verifique .gitignore."
    exit 1
}

# Commit
git commit -m "Base estável pós-hardening — sistema pronto para versionamento contínuo"

Write-Host "Commit base criado. Status:"
git status
Write-Host "Branch atual:" (git branch --show-current)
