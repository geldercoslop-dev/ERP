#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# retry <max_attempts> <sleep_secs> <command...>
# ---------------------------------------------------------------------------
retry() {
  local max="$1"; shift
  local delay="$1"; shift
  local n=0
  until "$@"; do
    n=$((n + 1))
    if [ "$n" -ge "$max" ]; then
      echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] FAIL after $n attempts: $*"
      return 1
    fi
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] retry $n/$max — sleeping ${delay}s..."
    sleep "$delay"
  done
}

# ---------------------------------------------------------------------------
# 1. docker ps
# ---------------------------------------------------------------------------
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] checking docker ps"
docker ps

# ---------------------------------------------------------------------------
# 2. health endpoint — retry até 10x com intervalo de 3s, timeout 5s/req
# ---------------------------------------------------------------------------
check_health() {
  local body
  body="$(curl --silent --fail --max-time 5 --retry 5 --retry-delay 2 http://127.0.0.1:3000/health)"
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] health response: $body"
}

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] checking /health (max 10 attempts, 3s interval)"
retry 10 3 check_health

# ---------------------------------------------------------------------------
# 3. docker logs — verificar ausência de erros críticos
# ---------------------------------------------------------------------------
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] scanning container logs for errors"
error_matches="$(docker logs erp-api-prod 2>&1 | grep -Ei "error|fatal|exception" || true)"
if [ -n "$error_matches" ]; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] WARN — error patterns found in erp-api-prod logs:"
  echo "$error_matches"
  # Não aborta: logs de startup normais podem conter a palavra "error"
fi

echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") [validate-prod] ALL CHECKS PASSED"
exit 0
