/**
 * Telemetria leve: eventos de uso e estatísticas do usuário.
 * Persistência em localStorage. Contadores só aumentam (proteção contra diminuição/duplicação).
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "grs-telemetry";

export type UserStats = {
  missionsCompleted: number;
  itemsPurchased: number;
  levelsGained: number;
  daysActive: number;
  totalSessions: number;
  achievementsUnlocked: number;
  weeklyChallengesCompleted: number;
  streakIncreases: number;
};

export type TelemetryEvent =
  | "mission_completed"
  | "level_up"
  | "shop_purchase"
  | "achievement_unlocked"
  | "weekly_challenge_completed"
  | "streak_increased";

const DEFAULT_STATS: UserStats = {
  missionsCompleted: 0,
  itemsPurchased: 0,
  levelsGained: 0,
  daysActive: 0,
  totalSessions: 0,
  achievementsUnlocked: 0,
  weeklyChallengesCompleted: 0,
  streakIncreases: 0,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): { userStats: UserStats; lastActiveDate: string | null } {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { userStats: { ...DEFAULT_STATS }, lastActiveDate: null };
    const parsed = JSON.parse(raw) as {
      userStats?: Partial<UserStats>;
      lastActiveDate?: string | null;
    };
    const userStats: UserStats = {
      ...DEFAULT_STATS,
      ...parsed.userStats,
    };
    // Garantir números válidos e não negativos
    (Object.keys(DEFAULT_STATS) as (keyof UserStats)[]).forEach((k) => {
      const v = userStats[k];
      userStats[k] = Math.max(0, typeof v === "number" && Number.isFinite(v) ? v : 0);
    });
    return {
      userStats,
      lastActiveDate: typeof parsed.lastActiveDate === "string" ? parsed.lastActiveDate : null,
    };
  } catch {
    return { userStats: { ...DEFAULT_STATS }, lastActiveDate: null };
  }
}

function save(userStats: UserStats, lastActiveDate: string | null) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ userStats, lastActiveDate })
      );
    }
  } catch {}
}

/** Mescla estado novo com o que está no storage: só mantém o maior valor por campo (nunca diminuir). */
function mergeMax(
  current: UserStats,
  next: Partial<UserStats>
): UserStats {
  const out = { ...current };
  (Object.keys(next) as (keyof UserStats)[]).forEach((k) => {
    const n = next[k];
    if (typeof n === "number" && Number.isFinite(n)) {
      out[k] = Math.max(current[k] ?? 0, n);
    }
  });
  return out;
}

let cached = load();
const listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

export function getStats(): UserStats {
  const stored = load();
  cached = stored;
  return stored.userStats;
}

/**
 * Registra abertura de sessão (app aberto).
 * Incrementa totalSessions em 1; se for outro dia, incrementa daysActive e atualiza lastActiveDate.
 */
export function trackSessionOpen(): void {
  const stored = load();
  const today = todayISO();
  let { userStats, lastActiveDate } = stored;

  const nextStats = { ...userStats };
  nextStats.totalSessions = (userStats.totalSessions || 0) + 1;
  if (lastActiveDate !== today) {
    nextStats.daysActive = (userStats.daysActive || 0) + 1;
    lastActiveDate = today;
  }

  const merged = mergeMax(load().userStats, nextStats);
  save(merged, lastActiveDate);
  cached = { userStats: merged, lastActiveDate };
  notify();
}

const EVENT_TO_STAT: Record<TelemetryEvent, keyof UserStats> = {
  mission_completed: "missionsCompleted",
  level_up: "levelsGained",
  shop_purchase: "itemsPurchased",
  achievement_unlocked: "achievementsUnlocked",
  weekly_challenge_completed: "weeklyChallengesCompleted",
  streak_increased: "streakIncreases",
};

/**
 * Registra um evento de uso. Só incrementa o contador correspondente (nunca diminui).
 */
export function trackEvent(event: TelemetryEvent): void {
  const key = EVENT_TO_STAT[event];
  const stored = load();
  const next = { ...stored.userStats, [key]: (stored.userStats[key] ?? 0) + 1 };
  const merged = mergeMax(stored.userStats, next);
  save(merged, stored.lastActiveDate);
  cached = { userStats: merged, lastActiveDate: stored.lastActiveDate };
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/**
 * Hook: retorna userStats atual e funções trackEvent / trackSessionOpen.
 */
export function useTelemetryStore(): {
  userStats: UserStats;
  trackEvent: (event: TelemetryEvent) => void;
  trackSessionOpen: () => void;
} {
  const [stats, setStats] = useState<UserStats>(() => getStats());

  useEffect(() => {
    setStats(getStats());
    const unsub = subscribe(() => setStats(getStats()));
    return unsub;
  }, []);

  return {
    userStats: stats,
    trackEvent,
    trackSessionOpen,
  };
}
