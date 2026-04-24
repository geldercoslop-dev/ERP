/**
 * Cache global em memória para integrações externas e dados frequentes.
 * Objetivo: evitar chamadas excessivas às APIs (TTL padrão 5 minutos).
 * Features: estatísticas, limpeza automática, expiração por tempo.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MIN_TTL_MS = 5_000;
const MAX_TTL_MS = 15 * 60 * 1000;
const MAX_KEYS = Math.min(5000, Math.max(200, Number(process.env.API_CACHE_MAX_KEYS) || 2000));

type Entry<T> = { 
  value: T; 
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
};

type CacheStats = {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  totalKeys: number;
  memoryUsage: number;
};

const store = new Map<string, Entry<unknown>>();
const stats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
  totalKeys: 0,
  memoryUsage: 0,
};

// Limpeza automática a cada 10 minutos
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;

function now(): number {
  return Date.now();
}

/**
 * Limpa entradas expiradas e atualiza estatísticas.
 */
function cleanup(): void {
  const before = store.size;
  const expiredKeys: string[] = [];
  
  // Converter para Array para compatibilidade com ES2020
  Array.from(store.entries()).forEach(([key, entry]) => {
    if (now() >= entry.expiresAt) {
      expiredKeys.push(key);
    }
  });
  
  expiredKeys.forEach(key => store.delete(key));
  stats.evictions += expiredKeys.length;
  stats.totalKeys = store.size;
  
  if (expiredKeys.length > 0 && process.env.NODE_ENV !== "production") {
    console.log(`[Cache] Cleanup: removidas ${expiredKeys.length} chaves expiradas`);
  }
}

/**
 * Estima uso de memória (aproximado).
 */
function estimateMemoryUsage(): number {
  let total = 0;
  // Converter para Array para compatibilidade com ES2020
  Array.from(store.entries()).forEach(([key, entry]) => {
    total += key.length * 2; // string chars
    total += JSON.stringify(entry.value).length * 2;
    total += 64; // overhead estimado
  });
  return total;
}

function updateStats(): void {
  stats.totalKeys = store.size;
  stats.memoryUsage = estimateMemoryUsage();
}

/**
 * Obtém valor do cache se existir e não estiver expirado.
 */
export function get<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) {
    stats.misses++;
    return undefined;
  }
  
  if (now() >= entry.expiresAt) {
    store.delete(key);
    stats.misses++;
    stats.evictions++;
    return undefined;
  }
  
  // Atualiza estatísticas de acesso
  entry.accessCount++;
  entry.lastAccessed = now();
  stats.hits++;
  
  return entry.value;
}

/**
 * Grava valor no cache com TTL em ms (padrão 5 min).
 */
export function set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  const ms = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttlMs || DEFAULT_TTL_MS));
  if (store.size >= MAX_KEYS) {
    const entries = Array.from(store.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const drop = Math.floor(MAX_KEYS * 0.08) + 1;
    for (let i = 0; i < drop && i < entries.length; i++) {
      store.delete(entries[i][0]);
      stats.evictions++;
    }
  }
  const t = now();
  const entry: Entry<T> = {
    value,
    expiresAt: t + ms,
    createdAt: t,
    accessCount: 0,
    lastAccessed: t,
  };
  store.set(key, entry);
  stats.sets++;
  updateStats();
}

/**
 * Executa a função de busca apenas se o cache não tiver valor válido.
 * Retorna o valor (do cache ou da função) e grava no cache com ttlMs.
 * integrationLabel: se informado, registra chamada de API em /metrics quando houver cache miss.
 */
export async function getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
  integrationLabel?: string
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== undefined) return cached;
  
  if (integrationLabel) {
    try {
      // Módulo metrics não encontrado - ignorar por enquanto
      // const { recordApiCall } = await import("../_core/metrics.js");
      // recordApiCall(integrationLabel);
    } catch {
      // ignore
    }
  }
  
  const value = await fetchFn();
  set(key, value, ttlMs);
  return value;
}

/**
 * Limpa uma chave ou todo o cache (útil para testes).
 */
export function invalidate(keyOrAll?: string): void {
  if (keyOrAll === undefined) {
    const size = store.size;
    store.clear();
    stats.evictions += size;
    updateStats();
  } else {
    const existed = store.delete(keyOrAll);
    if (existed) stats.evictions++;
    updateStats();
  }
}

/**
 * Retorna estatísticas do cache.
 */
export function getStats(): CacheStats {
  updateStats();
  return { ...stats };
}

/**
 * Inicia o cleanup automático.
 */
export function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
}

/**
 * Para o cleanup automático.
 */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

// Inicia cleanup automaticamente
if (typeof globalThis !== "undefined" && !cleanupTimer) {
  startCleanupTimer();
}

// Cleanup no encerramento do processo
if (typeof process !== "undefined") {
  process.on("SIGTERM", stopCleanupTimer);
  process.on("SIGINT", stopCleanupTimer);
}
