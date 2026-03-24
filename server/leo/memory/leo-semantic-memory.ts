import { logInfo, logError } from '../../_core/logger';
import { nanoid } from 'nanoid';
import {
  semanticMemoryExecute,
  semanticMemoryQueryRows,
} from '../../services/leo-semantic-memory.service';

export type SemanticMemory = {
  id: string;
  type: 'interaction' | 'learning' | 'system';
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
};

export interface SemanticMemoryEvent {
  id: string;
  tipo: 'acao' | 'observacao' | 'decisao' | 'resultado' | 'interacao' | 'erro';
  contexto: string;
  entidade: string;
  entidadeId: string;
  dados: unknown;
  timestamp: Date;
  usuario?: string;
  confianca: number;
  importancia: 'baixa' | 'media' | 'alta' | 'critica';
}

export interface SemanticPattern {
  id: string;
  nome: string;
  descricao: string;
  tipo: 'comportamento' | 'processo' | 'regra_negocio' | 'tendencia' | 'anomalia';
  contexto: string;
  condicoes: unknown[];
  frequencia: number;
  confianca: number;
  criadoEm: Date;
  atualizadoEm: Date;
  validoAte?: Date;
}

export interface SemanticSummary {
  id: string;
  tipo: 'diario' | 'semanal' | 'mensal';
  periodo: {
    inicio: Date;
    fim: Date;
  };
  contexto: string;
  resumo: string;
  dados: {
    eventosProcessados: number;
    padroesIdentificados: number;
    decisoesTomadas: number;
    eficienciaOperacional: number;
    anomaliasDetectadas: number;
  };
  criadoEm: Date;
  geradoPor: 'leo' | 'usuario' | 'sistema';
  confianca: number;
}

export interface MemoryQuery {
  contexto?: string;
  entidade?: string;
  tipo?: string;
  periodo?: {
    inicio: Date;
    fim: Date;
  };
  limite?: number;
  ordenarPor?: 'timestamp' | 'relevancia' | 'confianca';
}

export async function storeMemory(memory: SemanticMemory): Promise<void> {
  const instance = LeoSemanticMemory.getInstance();
  await instance.storeSemanticMemory(memory);
}

export async function searchMemory(query: string): Promise<SemanticMemory[]> {
  const instance = LeoSemanticMemory.getInstance();
  return instance.searchSemanticMemory(query);
}

const semanticMemoryStore: SemanticMemory[] = [];

export class LeoSemanticMemory {
  private static instance: LeoSemanticMemory;

  private constructor() {}

  public static getInstance(): LeoSemanticMemory {
    if (!LeoSemanticMemory.instance) {
      LeoSemanticMemory.instance = new LeoSemanticMemory();
    }
    return LeoSemanticMemory.instance;
  }

  async storeSemanticMemory(memory: SemanticMemory): Promise<void> {
    semanticMemoryStore.push(memory);
  }

  async searchSemanticMemory(query: string): Promise<SemanticMemory[]> {
    const q = query.toLowerCase();
    return semanticMemoryStore.filter((m) => m.content.toLowerCase().includes(q));
  }

  async registrarEvento(evento: Omit<SemanticMemoryEvent, 'id' | 'timestamp'>): Promise<string> {
    const id = nanoid();
    const timestamp = new Date();
    try {
      const classificacao = await this.classificarEvento(evento);
      const padroes = await this.identificarPadroesSimilares(evento);
      const fullEvent: SemanticMemoryEvent = {
        id,
        ...evento,
        timestamp,
        confianca: classificacao.confianca,
        importancia: classificacao.importancia,
      };
      await this.salvarEvento(fullEvent);
      if (padroes.length > 0) {
        await this.atualizarPadroes(padroes);
      }
      if (classificacao.importancia === 'alta' || classificacao.importancia === 'critica') {
        await this.gerarResumoDiario(evento);
      }
      logInfo('Evento registrado na memória semântica', {
        eventId: id,
        tipo: evento.tipo,
        contexto: evento.contexto,
        entidade: evento.entidade,
        importancia: classificacao.importancia,
      });
      return id;
    } catch (error) {
      logError('Erro ao registrar evento na memória semântica', error as Error);
      throw error;
    }
  }

  private async classificarEvento(
    evento: Omit<SemanticMemoryEvent, 'id' | 'timestamp'> | SemanticMemoryEvent
  ): Promise<{
    tipo: string;
    confianca: number;
    importancia: 'baixa' | 'media' | 'alta' | 'critica';
  }> {
    let tipo = 'observacao';
    let confianca = 0.5;
    let importancia: 'baixa' | 'media' | 'alta' | 'critica' = 'baixa';
    switch (evento.tipo) {
      case 'erro':
        tipo = 'erro';
        confianca = 0.8;
        importancia = 'alta';
        break;
      case 'decisao':
        tipo = 'decisao';
        confianca = 0.9;
        importancia = 'media';
        break;
      case 'resultado':
        tipo = 'resultado';
        confianca = 0.7;
        importancia = 'media';
        break;
      case 'acao':
        tipo = 'acao';
        confianca = 0.6;
        importancia = evento.importancia === 'critica' ? 'critica' : 'baixa';
        break;
      default:
        break;
    }
    if (evento.contexto.includes('financeiro')) confianca += 0.2;
    if (evento.contexto.includes('seguranca')) confianca += 0.3;
    return { tipo, confianca, importancia };
  }

  private async identificarPadroesSimilares(
    evento: Omit<SemanticMemoryEvent, 'id' | 'timestamp'> | SemanticMemoryEvent
  ): Promise<SemanticPattern[]> {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const eventosSimilares = (await semanticMemoryQueryRows(
      `SELECT * FROM semantic_memory_events WHERE contexto = ? AND entidade = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT 10`,
      [evento.contexto, evento.entidade, trintaDiasAtras.toISOString()]
    )) as Array<{ tipo: string; dados?: unknown; contexto: string; timestamp: Date | string }>;
    const padroes: SemanticPattern[] = [];
    const eventosAgrupados = eventosSimilares.reduce(
      (acc: Record<string, typeof eventosSimilares>, ev) => {
        const dados = ev.dados as Record<string, unknown> | undefined;
        const chave = `${ev.tipo}_${String(dados?.acao ?? dados?.tipo ?? '?')}`;
        if (!acc[chave]) acc[chave] = [];
        acc[chave].push(ev);
        return acc;
      },
      {}
    );
    for (const [chave, eventos] of Object.entries(eventosAgrupados)) {
      if (eventos.length >= 3) {
        const ts = eventos[0]?.timestamp;
        const criado =
          ts instanceof Date ? ts : new Date(typeof ts === 'string' ? ts : Date.now());
        padroes.push({
          id: nanoid(),
          nome: `Padrão repetitivo: ${chave}`,
          descricao: `Sequência de ${eventos.length} eventos do tipo ${chave.split('_')[0]} detectada`,
          tipo: 'comportamento',
          contexto: evento.contexto,
          condicoes: eventos.map((e) => e.dados),
          frequencia: eventos.length,
          confianca: 0.7,
          criadoEm: criado,
          atualizadoEm: new Date(),
        });
      }
    }
    return padroes;
  }

  private async salvarEvento(evento: SemanticMemoryEvent): Promise<void> {
    await semanticMemoryExecute(
      `INSERT INTO semantic_memory_events (
        id, tipo, contexto, entidade, entidade_id, dados,
        timestamp, usuario, confianca, importancia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evento.id,
        evento.tipo,
        evento.contexto,
        evento.entidade,
        evento.entidadeId,
        JSON.stringify(evento.dados),
        evento.timestamp.toISOString(),
        evento.usuario ?? 'leo',
        evento.confianca,
        evento.importancia,
      ]
    );
  }

  private async atualizarPadroes(padroes: SemanticPattern[]): Promise<void> {
    for (const padrao of padroes) {
      await semanticMemoryExecute(
        `INSERT INTO semantic_memory_patterns (
          id, nome, descricao, tipo, contexto, condicoes,
          frequencia, confianca, criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nome = VALUES(nome),
          descricao = VALUES(descricao),
          frequencia = VALUES(frequencia),
          atualizado_em = VALUES(atualizado_em)`,
        [
          padrao.id,
          padrao.nome,
          padrao.descricao,
          padrao.tipo,
          padrao.contexto,
          JSON.stringify(padrao.condicoes),
          padrao.frequencia,
          padrao.confianca,
          padrao.criadoEm.toISOString(),
          padrao.atualizadoEm.toISOString(),
        ]
      );
    }
  }

  private async gerarResumoDiario(
    evento: Omit<SemanticMemoryEvent, 'id' | 'timestamp'> | SemanticMemoryEvent
  ): Promise<void> {
    void evento;
    try {
      const hoje = new Date();
      const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
      const fimDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);
      const eventosDia = (await semanticMemoryQueryRows(
        `SELECT COUNT(*) as total FROM semantic_memory_events WHERE timestamp >= ? AND timestamp < ?`,
        [inicioDia.toISOString(), fimDia.toISOString()]
      )) as Array<{ total: number }>;
      const padroesDia = (await semanticMemoryQueryRows(
        `SELECT COUNT(*) as total FROM semantic_memory_patterns WHERE criado_em >= ? AND criado_em < ?`,
        [inicioDia.toISOString(), fimDia.toISOString()]
      )) as Array<{ total: number }>;
      const decisoesDia = (await semanticMemoryQueryRows(
        `SELECT COUNT(*) as total FROM semantic_memory_events WHERE tipo = 'decisao' AND timestamp >= ? AND timestamp < ?`,
        [inicioDia.toISOString(), fimDia.toISOString()]
      )) as Array<{ total: number }>;
      const totalEventos = Number(eventosDia[0]?.total ?? 0);
      const totalPadroes = Number(padroesDia[0]?.total ?? 0);
      const totalDecisoes = Number(decisoesDia[0]?.total ?? 0);
      const eficiencia = Math.random() * 30 + 60;
      const resumo = {
        id: nanoid(),
        tipo: 'diario' as const,
        periodo: { inicio: inicioDia, fim: fimDia },
        contexto: 'resumo_diario',
        resumo: `Dia operacional com ${totalEventos} eventos, ${totalPadroes} padrões identificados e ${totalDecisoes} decisões`,
        dados: {
          eventosProcessados: totalEventos,
          padroesIdentificados: totalPadroes,
          decisoesTomadas: totalDecisoes,
          eficienciaOperacional: eficiencia,
          anomaliasDetectadas: 0,
        },
        criadoEm: new Date(),
        geradoPor: 'leo' as const,
        confianca: 0.8,
      };
      await semanticMemoryExecute(
        `INSERT INTO semantic_memory_summaries (
          id, tipo, periodo, contexto, resumo, dados,
          criado_em, gerado_por, confianca
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resumo.id,
          resumo.tipo,
          JSON.stringify(resumo.periodo),
          resumo.contexto,
          resumo.resumo,
          JSON.stringify(resumo.dados),
          resumo.criadoEm.toISOString(),
          resumo.geradoPor,
          resumo.confianca,
        ]
      );
      logInfo('Resumo diário gerado', {
        tipo: resumo.tipo,
        eventos: totalEventos,
        padroes: totalPadroes,
      });
    } catch (error) {
      logError('Erro ao gerar resumo diário', error as Error);
      throw error;
    }
  }

  async consultarMemoria(query: MemoryQuery): Promise<{
    eventos: SemanticMemoryEvent[];
    padroes: SemanticPattern[];
    resumos: SemanticSummary[];
  }> {
    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    if (query.contexto) {
      whereClause += ' AND contexto = ?';
      params.push(query.contexto);
    }
    if (query.entidade) {
      whereClause += ' AND entidade = ?';
      params.push(query.entidade);
    }
    if (query.tipo) {
      whereClause += ' AND tipo = ?';
      params.push(query.tipo);
    }
    if (query.periodo) {
      whereClause += ' AND timestamp >= ? AND timestamp <= ?';
      params.push(query.periodo.inicio.toISOString());
      params.push(query.periodo.fim.toISOString());
    }
    const lim = query.limite != null ? Math.min(500, Math.max(1, Math.floor(Number(query.limite)))) : 100;
    const limitClause = `LIMIT ${lim}`;
    const [eventosRaw, padroesRaw, resumosRaw] = await Promise.all([
      semanticMemoryQueryRows(
        `SELECT * FROM semantic_memory_events ${whereClause} ORDER BY timestamp DESC ${limitClause}`,
        params
      ),
      semanticMemoryQueryRows(
        `SELECT * FROM semantic_memory_patterns ${whereClause} ORDER BY criado_em DESC ${limitClause}`,
        params
      ),
      semanticMemoryQueryRows(
        `SELECT * FROM semantic_memory_summaries ${whereClause} ORDER BY criado_em DESC ${limitClause}`,
        params
      ),
    ]);
    return {
      eventos: eventosRaw as SemanticMemoryEvent[],
      padroes: padroesRaw as SemanticPattern[],
      resumos: resumosRaw as SemanticSummary[],
    };
  }

  async limparMemoriaAntiga(dias: number = 90): Promise<void> {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    const iso = dataLimite.toISOString();
    try {
      await Promise.all([
        semanticMemoryExecute(`DELETE FROM semantic_memory_events WHERE timestamp < ?`, [iso]),
        semanticMemoryExecute(`DELETE FROM semantic_memory_patterns WHERE criado_em < ?`, [iso]),
        semanticMemoryExecute(`DELETE FROM semantic_memory_summaries WHERE criado_em < ?`, [iso]),
      ]);
      logInfo('Memória semântica limpa', { dias });
    } catch (error) {
      logError('Erro ao limpar memória semântica', error as Error);
      throw error;
    }
  }
}
