import { describe, it, expect } from 'vitest';

describe('ErrorRateMonitor Simple Test', () => {
  it('should exist and be importable', async () => {
    try {
      const errorRateModule = await import('./server/resilience/error-rate-monitor.js');
      expect(errorRateModule.ErrorRateMonitor).toBeDefined();
      expect(errorRateModule.globalErrorRateMonitor).toBeDefined();
    } catch (e) {
      console.error('Import error:', e);
      throw e;
    }
  });

  it('should create instance with default config', async () => {
    const { ErrorRateMonitor } = await import('./server/resilience/error-rate-monitor.js');
    const monitor = new ErrorRateMonitor();
    
    const status = monitor.getStatus();
    expect(status).toHaveProperty('windowSeconds');
    expect(status).toHaveProperty('threshold');
    expect(status).toHaveProperty('isAlerting');
    expect(status).toHaveProperty('recentErrorCount');
  });
});
