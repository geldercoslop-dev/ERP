$raw = Get-Content docker-compose.yml -Raw
$servicesSection = [regex]::Match($raw, '(?ms)^services:\s*\r?\n(.*?)(?=^volumes:|^networks:|\z)').Groups[1].Value
$serviceMatches = [regex]::Matches($servicesSection, '(?m)^  ([a-zA-Z0-9_-]+):\s*$')
$services = @($serviceMatches | ForEach-Object { $_.Groups[1].Value })

$images = @()
$latestErrors = @()
$restartStatus = @()
$healthStatus = @()
$resourcesStatus = @()
$volumesStatus = @()

foreach ($svc in $services) {
  $block = [regex]::Match($servicesSection, "(?ms)^  ${svc}:\s*\r?\n(.*?)(?=^  [a-zA-Z0-9_-]+:\s*\r?$|\z)").Value

  $imgMatch = [regex]::Match($block, '(?m)^\s{4}image:\s*(.+)$')
  if ($imgMatch.Success) {
    $img = $imgMatch.Groups[1].Value.Trim()
    $images += "$svc=$img"
    if ($img -match '(^|:)latest$') {
      $latestErrors += "$svc usa latest ($img)"
    }
  } else {
    $images += "$svc=(sem image - build)"
  }

  if ($block -match '(?m)^\s{4}restart:\s*.+$') { $restartStatus += "$svc=OK" } else { $restartStatus += "$svc=FALTA" }
  if ($block -match '(?m)^\s{4}healthcheck:\s*$') { $healthStatus += "$svc=OK" } else { $healthStatus += "$svc=FALTA" }

  if (($block -match '(?m)^\s{4}mem_limit:\s*.+$') -or ($block -match '(?m)^\s{4}deploy:\s*$') -or ($block -match '(?m)^\s{4}cpus:\s*.+$') -or ($block -match '(?m)^\s{4}cpu_quota:\s*.+$')) {
    $resourcesStatus += "$svc=OK"
  } else {
    $resourcesStatus += "$svc=FALTA"
  }

  if ($block -match '(?m)^\s{4}volumes:\s*$') { $volumesStatus += "$svc=COM_PERSISTENCIA" } else { $volumesStatus += "$svc=SEM_PERSISTENCIA" }
}

$out = @()
$out += 'IMAGENS:'
$out += $images
$out += ''
$out += 'LATEST_CHECK:'
if ($latestErrors.Count -eq 0) {
  $out += 'OK: nenhuma imagem com latest'
} else {
  $out += 'ERRO: imagens com latest'
  $out += $latestErrors
}
$out += ''
$out += 'RESTART:'
$out += $restartStatus
$out += ''
$out += 'HEALTHCHECK:'
$out += $healthStatus
$out += ''
$out += 'RESOURCES:'
$out += $resourcesStatus
$out += ''
$out += 'VOLUMES:'
$out += $volumesStatus

$out | Set-Content docker_hardening.txt
