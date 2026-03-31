#!/usr/bin/env pwsh

# Limpura de histórico anterior
Clear-Host

# Simples: rodar tsc e capture a primeira linha de erro
Write-Host "Iniciando diagnóstico..." -ForegroundColor Cyan

$output = @()
$proc = [System.Diagnostics.Process]::new()
$proc.StartInfo.FileName = "pnpm"
$proc.StartInfo.Arguments = "exec tsc -p tsconfig.server.json"
$proc.StartInfo.UseShellExecute = $false
$proc.StartInfo.RedirectStandardError = $true
$proc.StartInfo.RedirectStandardOutput = $true
$proc.StartInfo.WorkingDirectory = "C:\ERP"
$proc.Start() | Out-Null

$stdout = $proc.StandardOutput.ReadToEnd()
$stderr = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
$exitCode = $proc.ExitCode

Write-Host "exit code: $exit Code"
Write-Host "stdout length: $($stdout.Length)"
Write-Host "stderr length: $($stderr.Length)"

if ($stdout) {
    Write-Host "=== STDOUT ===" -ForegroundColor Yellow
    Write-Host ($stdout | Select-Object -First 10) -ForegroundColor White
}

if ($stderr) {
    Write-Host "=== STDERR ===" -ForegroundColor Red
    Write-Host ($stderr | Select-Object -First 10) -ForegroundColor White
}
