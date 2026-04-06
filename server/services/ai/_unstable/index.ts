export type SafeAIResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export async function toSafeAIResponse<T>(fn: () => Promise<T>): Promise<SafeAIResponse> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

export * from './alerts.service.js';
export * from './app-discovery.service.js';
export * from './business-insights.js';
export * from './finance-engine.js';
export * from './financial-insights.service.js';
export * from './insight-engine.js';
export * from './pendencias-engine.js';
export * from './prediction-engine.js';
export * from './sales-analytics.service.js';
export * from './stock-analytics.service.js';

