@echo off
cd /d "%~dp0.."
echo Limpando idempotency_keys (TTL 7 dias + em processamento travado 15 min)...
npx tsx scripts/maintenance/cleanup-idempotency.ts
pause
