/**
 * LEO Memory - Gerenciador de contexto da conversa do assistente.
 *
 * Suporta sessionContext, recentEntities e lastAction para continuidade de conversa
 * (ex.: "quem é esse cliente?", "quanto ele está devendo?").
 */

import { logger } from "../../utils/logger";

export type MemoryEntry = {
  id: string;
  usuario: string;
  pergunta: string;
  resposta: string;
  timestamp: Date;
  entidades?: Record<string, unknown>;
  ultimaAcao?: string;
};

/** Contexto de sessão para o LEO (últimas N interações em texto). */
export type SessionContext = {
  turns: Array<{ pergunta: string; resposta: string; timestamp: string }>;
  summary?: string;
};

/** Entidades recentes extraídas nas últimas ações (para referência anafórica). */
export type RecentEntities = Record<string, unknown> & {
  lastClienteId?: number;
  lastPedidoId?: number;
  lastPedidoNumero?: number;
  nomeCliente?: string;
  numeroPedido?: number;
  [key: string]: unknown;
};

const MAX_HISTORY = 10;
const MAX_SESSION_TURNS = 5;
const MAX_RECENT_ENTITIES_ENTRIES = 5;

class LeoMemory {
  private static instance: LeoMemory;
  private memoryCache: Map<string, MemoryEntry[]> = new Map();

  private constructor() {}

  public static getInstance(): LeoMemory {
    if (!LeoMemory.instance) {
      LeoMemory.instance = new LeoMemory();
    }
    return LeoMemory.instance;
  }

  /**
   * Adiciona uma interação à memória do usuário.
   */
  public record(
    usuario: string,
    pergunta: string,
    resposta: string,
    entidades?: Record<string, unknown>,
    ultimaAcao?: string
  ): void {
    const entry: MemoryEntry = {
      id: Math.random().toString(36).substring(2, 11),
      usuario,
      pergunta,
      resposta,
      timestamp: new Date(),
      entidades,
      ultimaAcao,
    };

    const history = this.memoryCache.get(usuario) || [];
    history.push(entry);
    if (history.length > MAX_HISTORY) history.shift();
    this.memoryCache.set(usuario, history);
    logger.debug({ message: "Memória do LEO atualizada", usuario, entries: history.length } as Record<string, unknown>);
  }

  /**
   * Obtém o histórico recente do usuário.
   */
  public getHistory(usuario: string): MemoryEntry[] {
    return this.memoryCache.get(usuario) || [];
  }

  /**
   * Obtém o último contexto (entidades e ação) do usuário.
   */
  public getLastContext(usuario: string): Partial<MemoryEntry> | null {
    const history = this.getHistory(usuario);
    if (history.length === 0) return null;
    return history[history.length - 1];
  }

  /**
   * Contexto de sessão: últimas N perguntas/respostas para continuidade de conversa.
   */
  public getSessionContext(usuario: string, maxTurns: number = MAX_SESSION_TURNS): SessionContext {
    const history = this.getHistory(usuario);
    const turns = history
      .slice(-maxTurns)
      .map((e) => ({
        pergunta: e.pergunta,
        resposta: e.resposta,
        timestamp: e.timestamp.toISOString(),
      }));
    return { turns };
  }

  /**
   * Entidades recentes (últimas N entradas com entidades) para referência anafórica.
   */
  public getRecentEntities(usuario: string, maxEntries: number = MAX_RECENT_ENTITIES_ENTRIES): RecentEntities {
    const history = this.getHistory(usuario);
    const out: RecentEntities = {};
    const withEntities = history.filter((e) => e.entidades && Object.keys(e.entidades).length > 0).slice(-maxEntries);
    for (const e of withEntities) {
      if (e.entidades) Object.assign(out, e.entidades);
    }
    return out;
  }

  /**
   * Última ação executada (nome da tool/intent) para o usuário.
   */
  public getLastAction(usuario: string): string | null {
    const last = this.getLastContext(usuario);
    return (last?.ultimaAcao as string) ?? null;
  }

  /**
   * Limpa a memória do usuário.
   */
  public clear(usuario: string): void {
    this.memoryCache.delete(usuario);
    logger.info({ message: "Memória do LEO limpa", usuario } as Record<string, unknown>);
  }
}

export const leoMemory = LeoMemory.getInstance();
