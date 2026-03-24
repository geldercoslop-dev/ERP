$ErrorActionPreference = "Stop"

Write-Host "[staging-gate] 1/4 Typecheck server"
pnpm exec tsc -p tsconfig.server.json --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[staging-gate] 2/4 Infra check"
pnpm run check:infra
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[staging-gate] 3/4 Build"
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[staging-gate] 4/4 Start production"
pnpm start:prod
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
