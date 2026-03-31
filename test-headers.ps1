# Teste de Headers - Validação de Segurança

Write-Host "🔐 Iniciando teste de headers de segurança..."
Write-Host "=================================="

# Teste 1: Verificar headers CORS
Write-Host ""
Write-Host "📊 Teste 1: Verificar headers CORS em /api/health"

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -Method GET -UseBasicParsing $false
    $corsHeaders = $response.Headers["Access-Control-Allow-Headers"]
    
    Write-Host "Headers CORS encontrados:"
    Write-Host $corsHeaders
    
    if ($corsHeaders -and $corsHeaders -match "X-Shutdown-Secret") {
        Write-Host "❌ VULNERABILIDADE: X-Shutdown-Secret exposto!"
        Write-Host "Header sensível encontrado nos allowedHeaders"
    } else {
        Write-Host "✅ X-Shutdown-Secret não encontrado nos headers"
        Write-Host "Proteção contra information disclosure funcionando"
    }
    
    # Verificar outros headers essenciais
    $essentialHeaders = @("Content-Type", "Authorization", "X-Session-Token", "X-App-Secret", "User-Agent")
    foreach ($header in $essentialHeaders) {
        if ($corsHeaders -and $corsHeaders -match $header) {
            Write-Host "✅ $header : presente"
        } else {
            Write-Host "⚠️  $header : ausente"
        }
    }
    
} catch {
    Write-Host "❌ Erro ao conectar ao servidor: $_"
    Write-Host "Certifique-se de que o servidor está rodando em localhost:3000"
}

Write-Host ""
Write-Host "=================================="

# Teste 2: Verificar diferentes endpoints
Write-Host ""
Write-Host "📊 Teste 2: Verificar headers em endpoints diversos"

$endpoints = @(
    "/api/health",
    "/api/trpc/health.check",
    "/ping"
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000$endpoint" -Method GET -UseBasicParsing $false
        $corsHeaders = $response.Headers["Access-Control-Allow-Headers"]
        
        if ($corsHeaders -and $corsHeaders -match "X-Shutdown-Secret") {
            Write-Host "❌ $endpoint : X-Shutdown-Secret exposto"
        } else {
            Write-Host "✅ $endpoint : seguro"
        }
    } catch {
        Write-Host "⚠️  $endpoint : erro na requisição"
    }
}

Write-Host ""
Write-Host "🧪 Teste de headers finalizado"
