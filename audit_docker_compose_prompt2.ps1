$raw = Get-Content docker-compose.yml -Raw
$servicesSection = [regex]::Match($raw, '(?ms)^services:\s*\r?\n(.*?)(?=^volumes:|^networks:|\z)').Groups[1].Value
$serviceMatches = [regex]::Matches($servicesSection, '(?m)^  ([a-zA-Z0-9_-]+):\s*$')
$services = @($serviceMatches | ForEach-Object { $_.Groups[1].Value })

$imagesOut = @()
$latestOut = @()
$restartOut = @()
$healthOut = @()
$resourcesOut = @()
$volumesOut = @()
$latestFound = $false

foreach ($svc in $services) {
  $block = [regex]::Match($servicesSection, "(?ms)^  ${svc}:\s*\r?\n(.*?)(?=^  [a-zA-Z0-9_-]+:\s*\r?$|\z)").Value

  $imgMatch = [regex]::Match($block, '(?m)^\s{4}image:\s*(.+)$')
  if ($imgMatch.Success) {
    $img = $imgMatch.Groups[1].Value.Trim()
    $imagesOut += "$svc|$img"
    if ($img -match '(^|:)latest$') {
      $latestOut += "ERRO|$svc|$img"
      $latestFound = $true
    }
  } else {
    $imagesOut += "$svc|sem_image_build"
  }

  if ($block -match '(?m)^\s{4}restart:\s*.+$') { $restartOut += "$svc|OK" } else { $restartOut += "$svc|FALTA" }
  if ($block -match '(?m)^\s{4}healthcheck:\s*$') { $healthOut += "$svc|OK" } else { $healthOut += "$svc|FALTA" }

  if (($block -match '(?m)^\s{4}mem_limit:\s*.+$') -or ($block -match '(?m)^\s{4}deploy:\s*$') -or ($block -match '(?m)^\s{4}cpus:\s*.+$')) {
    $resourcesOut += "$svc|OK"
  } else {
    $resourcesOut += "$svc|FALTA"
  }

  $volBlockMatch = [regex]::Match($block, '(?m)^\s{4}volumes:\s*\r?\n((?:\s{6}-\s*[^\r\n]+\r?\n)+)')
  if ($volBlockMatch.Success) {
    $volLines = [regex]::Matches($volBlockMatch.Groups[1].Value, '(?m)^\s{6}-\s*(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() }
    if ($volLines.Count -gt 0) {
      $volumesOut += "$svc|" + ($volLines -join ',')
    } else {
      $volumesOut += "$svc|SEM_VOLUMES_DETALHE"
    }
  } else {
    $volumesOut += "$svc|SEM_PERSISTENCIA"
  }
}

$imagesOut | Set-Content images.txt
if ($latestFound) {
  $latestOut | Set-Content latest_check.txt
} else {
  'OK|nenhuma_imagem_latest' | Set-Content latest_check.txt
}
$restartOut | Set-Content restart.txt
$healthOut | Set-Content healthcheck.txt
$resourcesOut | Set-Content resources.txt
$volumesOut | Set-Content volumes.txt
