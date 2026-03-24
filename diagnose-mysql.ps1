#!/usr/bin/env powershell

# 🔍 Diagnostic: Encontrar e Tentar Fixar Problema de BD
# Localiza: MySQL credenciais, status serviço, conexão

Write-Host "`n"
Write-Host "╔════════════════════════════════════════════════════════════════╗"
Write-Host "║  🔍 DIAGNÓSTICO: Problema de Conexão MySQL                    ║"
Write-Host "╚════════════════════════════════════════════════════════════════╝"
Write-Host "`n"

$issues = @()
$warnings = @()
$fixed = @()

# ============================================================
# VERIFICAÇÃO 1: .env existe?
# ============================================================

Write-Host "1️⃣  Verificando .env..."

if (Test-Path ".env") {
    Write-Host "   ✅ Arquivo .env existe"
    
    # Ler DATABASE_URL
    $envContent = Get-Content .env -Raw
    if ($envContent -match 'DATABASE_URL=([^\r\n].+)') {
        $dbUrl = $matches[1]
        Write-Host "   ✅ DATABASE_URL encontrado"
        Write-Host "      Conteúdo (primeiro 60 chars): $($dbUrl.Substring(0, [Math]::Min(60, $dbUrl.Length)))..."
        
        # Parse URL
        if ($dbUrl -match 'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(\w+)') {
            $user = $matches[1]
            $pass = $matches[2]
            $host = $matches[3]
            $port = $matches[4]
            $db = $matches[5]
            
            Write-Host "   📊 Parsed credentials:"
            Write-Host "      User: $user"
            Write-Host "      Host: $host"
            Write-Host "      Port: $port"
            Write-Host "      Database: $db"
            Write-Host ""
        } else {
            $issues += "DATABASE_URL parsing failed"
        }
    } else {
        $issues += ".env não tem DATABASE_URL"
    }
} else {
    $issues += ".env NÃO ENCONTRADO"
}

# ============================================================
# VERIFICAÇÃO 2: MySQL está rodando?
# ============================================================

Write-Host "2️⃣  Verificando serviço MySQL..."

try {
    $mysqlService = Get-Service | Where-Object { $_.Name -match "MySQL" }
    
    if ($mysqlService) {
        Write-Host "   ✅ Serviço MySQL encontrado: $($mysqlService.Name)"
        
        if ($mysqlService.Status -eq "Running") {
            Write-Host "   ✅ MySQL está RODANDO"
        } else {
            Write-Host "   ⚠️  MySQL está $($mysqlService.Status)"
            $warnings += "MySQL serviço não está running ($($mysqlService.Status))"
            
            # Tentar iniciar
            Write-Host "   🔧 Tentando iniciar MySQL..."
            try {
                Start-Service -Name $mysqlService.Name -ErrorAction Stop
                Write-Host "   ✅ MySQL iniciado com sucesso!"
                $fixed += "MySQL serviço iniciado"
                Start-Sleep -Seconds 3
            } catch {
                $issues += "Não foi possível iniciar MySQL: $($_.Exception.Message)"
            }
        }
    } else {
        $warnings += "Nenhum serviço MySQL encontrado"
        Write-Host "   ⚠️  Nenhum serviço MySQL encontrado"
        Write-Host "   (Pode estar rodando em container ou modo portable)"
    }
} catch {
    $warnings += "Erro ao verificar serviço: $($_.Exception.Message)"
}

Write-Host ""

# ============================================================
# VERIFICAÇÃO 3: Porta 3306 está listening?
# ============================================================

Write-Host "3️⃣  Verificando porta 3306..."

try {
    $connection = Test-NetConnection -ComputerName localhost -Port 3306 -WarningAction SilentlyContinue
    
    if ($connection.TcpTestSucceeded) {
        Write-Host "   ✅ Porta 3306 está OPEN (MySQL listening)"
    } else {
        Write-Host "   ❌ Porta 3306 NOT responding"
        $issues += "MySQL não está respondendo na porta 3306"
    }
} catch {
    $warnings += "Não consegui testar porta: $($_.Exception.Message)"
}

Write-Host ""

# ============================================================
# VERIFICAÇÃO 4: Tentar conectar ao MySQL
# ============================================================

Write-Host "4️⃣  Tentando conectar ao MySQL..."

if ($user -and $pass -and $host -and $port) {
    try {
        $connectionString = "Server=$host;Port=$port;User=$user;Password=$pass;"
        
        # Usar PowerShell para testar conexão
        $connection = New-Object System.Data.MySql.MySqlConnection
        $connection.ConnectionString = $connectionString
        
        Write-Host "   🔗 Tentando: $user@$host:$port"
        
        try {
            $connection.Open()
            Write-Host "   ✅ CONEXÃO OK!"
            $connection.Close()
            
            # Se conectou, agora testar database específico
            Write-Host "   🔗 Verificando database: $db"
            
            $connection.ConnectionString = "Server=$host;Port=$port;User=$user;Password=$pass;Database=$db;"
            $connection.Open()
            Write-Host "   ✅ Database $db ACESSÍVEL"
            
            # Test query
            $cmd = $connection.CreateCommand()
            $cmd.CommandText = "SELECT 1 AS test"
            $result = $cmd.ExecuteScalar()
            
            if ($result) {
                Write-Host "   ✅ Query simples funcionou"
            }
            
            $connection.Close()
        } catch {
            $issues += "Conexão recusada: $($_.Exception.Message)"
            Write-Host "   ❌ ERRO: $($_.Exception.Message)"
        }
    } catch {
        Write-Host "   ⚠️  MySql não está instalado ou acessível"
        $warnings += "MySQL PowerShell provider não disponível"
    }
} else {
    $warnings += "Credenciais não foram parsed corretamente"
}

Write-Host ""

# ============================================================
# RESUMO
# ============================================================

Write-Host "════════════════════════════════════════════════════════════════"
Write-Host "📊 DIAGNÓSTICO"
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host ""

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✅ NENHUM PROBLEMA ENCONTRADO"
    Write-Host ""
    Write-Host "Próximo passo:"
    Write-Host "  npm run test:db"
} else {
    if ($issues.Count -gt 0) {
        Write-Host "❌ PROBLEMAS CRÍTICOS:"
        $issues | ForEach-Object { Write-Host "   - $_" }
        Write-Host ""
    }
    
    if ($warnings.Count -gt 0) {
        Write-Host "⚠️  AVISOS:"
        $warnings | ForEach-Object { Write-Host "   - $_" }
        Write-Host ""
    }
}

if ($fixed.Count -gt 0) {
    Write-Host "✅ CORRIGIDO:"
    $fixed | ForEach-Object { Write-Host "   + $_" }
    Write-Host ""
    Write-Host "Aguardando 3 segundos para tentar teste..."
    Start-Sleep -Seconds 3
    Write-Host ""
    Write-Host "Executando: npm run test:db"
    npm run test:db
}

Write-Host "`n"
