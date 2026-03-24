export type RateLimitEntry = {
  count: number;
  lastAttempt: number;
};

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, lastAttempt: now });
    return;
  }

  if (now - entry.lastAttempt > WINDOW_MS) {
    store.set(key, { count: 1, lastAttempt: now });
    return;
  }

  entry.count += 1;
  entry.lastAttempt = now;

  if (entry.count > MAX_ATTEMPTS) {
    throw new Error("Too many attempts");
  }
}

export function clearRateLimitForKey(key: string): void {
  store.delete(key);
}

