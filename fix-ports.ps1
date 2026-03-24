# Script para verificar e corrigir problemas de porta
Write-Host "Verificando e corrigindo problemas de porta..." -ForegroundColor Cyan

# Verificar se há processos usando as portas 3000, 3001 e 3002
$ports = @(3000, 3001, 3002)
$foundProcesses = $false

foreach ($port in $ports) {
    $process = netstat -ano | findstr ":$port"
    if ($process) {
        $foundProcesses = $true
        Write-Host "Porta $port está em uso:" -ForegroundColor Yellow
        Write-Host $process
        
        # Extrair o PID
        $pidMatch = $process | Select-String -Pattern "LISTENING\s+(\d+)"
        if ($pidMatch -and $pidMatch.Matches.Groups.Count -gt 1) {
            $pid = $pidMatch.Matches.Groups[1].Value
            Write-Host "Encontrado processo com PID $pid na porta $port" -ForegroundColor Yellow
            
            # Obter informações do processo
            $processInfo = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($processInfo) {
                Write-Host "Nome do processo: $($processInfo.Name)" -ForegroundColor Yellow
                
                # Perguntar se deseja encerrar o processo
                $confirm = Read-Host "Deseja encerrar o processo $($processInfo.Name) (PID $pid) na porta $port? (S/N)"
                if ($confirm -eq "S" -or $confirm -eq "s") {
                    try {
                        Stop-Process -Id $pid -Force
                        Write-Host "Processo encerrado com sucesso." -ForegroundColor Green
                    } catch {
                        Write-Host "Erro ao encerrar o processo: $_" -ForegroundColor Red
                    }
                }
            } else {
                Write-Host "Não foi possível obter informações sobre o processo com PID $pid" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "Porta $port está livre." -ForegroundColor Green
    }
}

if (-not $foundProcesses) {
    Write-Host "Nenhum processo encontrado usando as portas 3000, 3001 ou 3002." -ForegroundColor Green
}

# Verificar se o arquivo port.ts existe e está configurado corretamente
$portFile = ".\server\_core\port.ts"
if (Test-Path $portFile) {
    $portContent = Get-Content $portFile
    Write-Host "Conteúdo atual do arquivo port.ts:" -ForegroundColor Yellow
    Write-Host $portContent
    
    # Perguntar se deseja atualizar o arquivo
    $confirm = Read-Host "Deseja atualizar o arquivo port.ts para usar a porta 3000? (S/N)"
    if ($confirm -eq "S" -or $confirm -eq "s") {
        $newContent = "// Este arquivo é gerado automaticamente pelo servidor para armazenar a porta atual`nexport const PORT = 3000;"
        Set-Content -Path $portFile -Value $newContent
        Write-Host "Arquivo port.ts atualizado para usar a porta 3000." -ForegroundColor Green
    }
} else {
    Write-Host "O arquivo port.ts não existe. Criando..." -ForegroundColor Yellow
    $newContent = "// Este arquivo é gerado automaticamente pelo servidor para armazenar a porta atual`nexport const PORT = 3000;"
    New-Item -Path $portFile -ItemType File -Value $newContent -Force
    Write-Host "Arquivo port.ts criado com a porta 3000." -ForegroundColor Green
}

# Verificar e criar/atualizar os arquivos .env
$rootEnvFile = ".\.env"
$clientEnvFile = ".\client\.env"

# Criar/atualizar o arquivo .env na raiz
if (Test-Path $rootEnvFile) {
    $confirm = Read-Host "O arquivo .env na raiz já existe. Deseja atualizá-lo? (S/N)"
    if ($confirm -eq "S" -or $confirm -eq "s") {
        $rootEnvContent = "# Configurações de ambiente para o servidor`nNODE_ENV=development`nPORT=3000"
        Set-Content -Path $rootEnvFile -Value $rootEnvContent
        Write-Host "Arquivo .env na raiz atualizado." -ForegroundColor Green
    }
} else {
    $rootEnvContent = "# Configurações de ambiente para o servidor`nNODE_ENV=development`nPORT=3000"
    New-Item -Path $rootEnvFile -ItemType File -Value $rootEnvContent -Force
    Write-Host "Arquivo .env na raiz criado." -ForegroundColor Green
}

# Criar/atualizar o arquivo .env no diretório client
if (Test-Path $clientEnvFile) {
    $confirm = Read-Host "O arquivo .env no diretório client já existe. Deseja atualizá-lo? (S/N)"
    if ($confirm -eq "S" -or $confirm -eq "s") {
        $clientEnvContent = "# Configurações de ambiente para o cliente`nVITE_PORT=3000`nVITE_TRPC_URL=http://localhost:3000/api/trpc"
        Set-Content -Path $clientEnvFile -Value $clientEnvContent
        Write-Host "Arquivo .env no diretório client atualizado." -ForegroundColor Green
    }
} else {
    $clientEnvContent = "# Configurações de ambiente para o cliente`nVITE_PORT=3000`nVITE_TRPC_URL=http://localhost:3000/api/trpc"
    New-Item -Path $clientEnvFile -ItemType File -Value $clientEnvContent -Force
    Write-Host "Arquivo .env no diretório client criado." -ForegroundColor Green
}

Write-Host "Verificação e correção de problemas de porta concluídas." -ForegroundColor Cyan
Write-Host "Para iniciar o sistema, execute o script start-system.ps1" -ForegroundColor Green