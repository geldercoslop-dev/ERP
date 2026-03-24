/**
 * Health monitor externo:
 * - faz GET /api/health a cada 10s
 * - loga falhas sem derrubar o processo
 */
const baseUrl = process.env.HEALTH_MONITOR_BASE_URL || "http://127.0.0.1:3004";
const intervalMs = Number(process.env.HEALTH_MONITOR_INTERVAL_MS || 10_000);
const appSecret = process.env.APP_SECRET || "pm2-local-secret";

async function checkHealth() {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: {
        "x-app-secret": appSecret,
        "user-agent": "external-health-monitor/1.0",
      },
      signal: AbortSignal.timeout(5_000),
    });
    const elapsed = Date.now() - startedAt;

    if (!res.ok) {
      console.error(
        `[health-monitor] FAIL status=${res.status} elapsedMs=${elapsed} url=${baseUrl}/api/health`
      );
      return;
    }

    const payload = await res.json();
    console.log(
      `[health-monitor] OK status=${res.status} elapsedMs=${elapsed} serviceStatus=${payload?.status ?? "unknown"}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[health-monitor] ERROR ${msg}`);
  }
}

console.log(
  `[health-monitor] started baseUrl=${baseUrl} intervalMs=${intervalMs}`
);
await checkHealth();
setInterval(() => {
  void checkHealth();
}, intervalMs);
