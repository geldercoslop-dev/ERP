$secret = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
$BASE_URL = "http://localhost:3000"

Write-Output "=================================="
Write-Output "TESTE 1 - AUTH (sem token)"
Write-Output "=================================="

$response = curl.exe -s "$BASE_URL/api/clientes" -w "`n%{http_code}"
$lines = @($response) -split "`n"
$status1 = $lines[-1].Trim()

Write-Output "Status HTTP: $status1"
Write-Output "Esperado: 401"
if ($status1 -eq "401") {
    Write-Output "✔ TESTE 1 PASSOU"
} else {
    Write-Output "❌ TESTE 1 FALHOU"
}
Write-Output ""

Write-Output "=================================="
Write-Output "TESTE 2 - LOGIN"
Write-Output "=================================="

$json = @{0=@{json=@{username="admin";password="admin123"}}} | ConvertTo-Json -Compress

$login_response = curl.exe -s -X POST "$BASE_URL/api/trpc/auth.login?batch=1" -H "Content-Type: application/json" -H "X-App-Secret: $secret" -d $json

$loginData = $login_response | ConvertFrom-Json -ErrorAction SilentlyContinue
$token = $loginData."0".result.data.json.sessionToken

if ($token) {
    $role = $loginData."0".result.data.json.role
    $name = $loginData."0".result.data.json.name
    Write-Output "✔ TESTE 2 PASSOU"
    Write-Output "Usuario: $name"
    Write-Output "Role: $role"
    Write-Output "Token: $token"
} else {
    Write-Output "❌ TESTE 2 FALHOU"
}
Write-Output ""

if ($token) {
    Write-Output "=================================="
    Write-Output "TESTE 3 - REQUEST COM TOKEN"
    Write-Output "=================================="
    
    $test3 = curl.exe -s "$BASE_URL/api/clientes" -w "`n%{http_code}" -H "Authorization: Bearer $token" -H "x-tenant-id: 1" -H "X-App-Secret: $secret"
    
    $lines3 = @($test3) -split "`n"
    $status3 = $lines3[-1].Trim()
    
    Write-Output "Status HTTP: $status3"
    Write-Output "Esperado: 200"
    if ($status3 -eq "200") {
        Write-Output "✔ TESTE 3 PASSOU"
    } else {
        Write-Output "❌ TESTE 3 FALHOU"
    }
    Write-Output ""
    
    Write-Output "=================================="
    Write-Output "TESTE 4 - QUEBRA DE SEGURANCA"
    Write-Output "Tenant 999 com token 1"
    Write-Output "=================================="
    
    $test4 = curl.exe -s "$BASE_URL/api/clientes" -w "`n%{http_code}" -H "Authorization: Bearer $token" -H "x-tenant-id: 999" -H "X-App-Secret: $secret"
    
    $lines4 = @($test4) -split "`n"
    $status4 = $lines4[-1].Trim()
    
    Write-Output "Status HTTP: $status4"
    Write-Output "Esperado: 403 ou 401"
    if ($status4 -eq "403" -or $status4 -eq "401") {
        Write-Output "✔ TESTE 4 PASSOU"
    } else {
        Write-Output "❌ TESTE 4 FALHOU - FALHA CRITICA"
    }
    Write-Output ""
}
