/**
 * Sistema de Métricas e Monitoramento Interno
 */

type AlertLevel = "ERROR" | "WARN";

type MetricsSnapshot = {
  timestamp: number;
  requestsPerSecond: string;
  errorsPerMinute: number;
  averageResponseTime: string | number;
  maxResponseTime: string | number;
  activeConnections: number;
  totalRequests: number;
  totalErrors: number;
};

let metricsStore: {
  requestsPerSecond: number;
  errorsPerMinute: number;
  averageResponseTime: number;
  activeConnections: number;
  lastUpdated: number;
  history: {
    requests: number[];
    errors: number[];
    responseTimes: number[];
  };
} = {
  requestsPerSecond: 0,
  errorsPerMinute: 0,
  averageResponseTime: 0,
  activeConnections: 0,
  lastUpdated: Date.now(),
  history: {
    requests: [],
    errors: [],
    responseTimes: [],
  },
};

export const metricsService = {
  recordRequest(duration: number) {
    metricsStore.history.requests.push(Date.now());
    metricsStore.history.responseTimes.push(duration);

    // Manter últimos 60s
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    metricsStore.history.requests = metricsStore.history.requests.filter(
      (t) => t > oneMinuteAgo
    );
    metricsStore.history.responseTimes = metricsStore.history.responseTimes.slice(-1000);
  },

  recordError() {
    metricsStore.history.errors.push(Date.now());
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    metricsStore.history.errors = metricsStore.history.errors.filter(
      (t) => t > oneMinuteAgo
    );
  },

  recordConnection(increment: number) {
    metricsStore.activeConnections += increment;
  },

  getMetrics(): MetricsSnapshot {
    const now = Date.now();
    const requests = metricsStore.history.requests;
    const errors = metricsStore.history.errors;
    const responseTimes = metricsStore.history.responseTimes;

    return {
      timestamp: now,
      requestsPerSecond: (requests.length / 60).toFixed(2),
      errorsPerMinute: errors.length,
      averageResponseTime:
        responseTimes.length > 0
          ? (
              responseTimes.reduce((a, b) => a + b, 0) /
              responseTimes.length
            ).toFixed(2)
          : 0,
      maxResponseTime:
        responseTimes.length > 0 ? Math.max(...responseTimes).toFixed(2) : 0,
      activeConnections: metricsStore.activeConnections,
      totalRequests: requests.length,
      totalErrors: errors.length,
    };
  },

  checkAlerts(): Array<{ level: AlertLevel; message: string }> {
    const metrics = this.getMetrics();
    const alerts: Array<{ level: AlertLevel; message: string }> = [];

    if (metrics.errorsPerMinute > 10) {
      alerts.push({
        level: "ERROR",
        message: `Muitos erros: ${metrics.errorsPerMinute}/min`,
      });
    }

    if (parseFloat(String(metrics.averageResponseTime)) > 1000) {
      alerts.push({
        level: "WARN",
        message: `Latência alta: ${metrics.averageResponseTime}ms`,
      });
    }

    if (metrics.activeConnections > 500) {
      alerts.push({
        level: "WARN",
        message: `Muitas conexões ativas: ${metrics.activeConnections}`,
      });
    }

    return alerts;
  },

  reset() {
    metricsStore.history = {
      requests: [],
      errors: [],
      responseTimes: [],
    };
  },
};

export default metricsService;
