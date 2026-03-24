#!/usr/bin/env bash
set -euo pipefail

echo "[staging-gate] 1/4 Typecheck server"
pnpm exec tsc -p tsconfig.server.json --noEmit

echo "[staging-gate] 2/4 Infra check"
pnpm run check:infra

echo "[staging-gate] 3/4 Build"
pnpm build

echo "[staging-gate] 4/4 Start production"
pnpm start:prod
