import type { RowDataPacket } from "mysql2/promise";
import { getConnectionPool } from "../config/database.js";
import type {
  MemoryQuery,
  SemanticMemoryEvent,
  SemanticPattern,
  SemanticSummary,
} from "../leo/memory/leo-semantic-memory.js";

export async function semanticMemoryQueryRows(sqlText: string, params: unknown[]): Promise<RowDataPacket[]> {
  try {
    const pool = await getConnectionPool();
    const [rows] = await pool.query<RowDataPacket[]>(sqlText, params);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function semanticMemoryExecute(sqlText: string, params: unknown[]): Promise<void> {
  try {
    const pool = await getConnectionPool();
    await pool.query(sqlText, params);
  } catch {
    void 0;
  }
}

export async function semanticMemoryExecuteMany(
  statements: Array<{ sql: string; params: unknown[] }>
): Promise<void> {
  for (const s of statements) {
    await semanticMemoryExecute(s.sql, s.params);
  }
}

type SimilarEventRow = { tipo: string; dados?: unknown; contexto: string; timestamp: Date | string };

export async function findRecentSimilarSemanticEvents(
  contexto: string,
  entidade: string,
  sinceIso: string,
  limit: number = 10
): Promise<SimilarEventRow[]> {
  const rows = await semanticMemoryQueryRows(
    `SELECT * FROM semantic_memory_events WHERE contexto = ? AND entidade = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT ${Math.max(1, Math.floor(limit))}`,
    [contexto, entidade, sinceIso]
  );
  return rows as SimilarEventRow[];
}

export async function saveSemanticMemoryEvent(evento: SemanticMemoryEvent): Promise<void> {
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
      evento.usuario ?? "leo",
      evento.confianca,
      evento.importancia,
    ]
  );
}

export async function upsertSemanticMemoryPattern(padrao: SemanticPattern): Promise<void> {
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

export async function getSemanticMemoryDailyStats(
  inicioIso: string,
  fimIso: string
): Promise<{ eventos: number; padroes: number; decisoes: number }> {
  const [eventosDia, padroesDia, decisoesDia] = await Promise.all([
    semanticMemoryQueryRows(
      `SELECT COUNT(*) as total FROM semantic_memory_events WHERE timestamp >= ? AND timestamp < ?`,
      [inicioIso, fimIso]
    ),
    semanticMemoryQueryRows(
      `SELECT COUNT(*) as total FROM semantic_memory_patterns WHERE criado_em >= ? AND criado_em < ?`,
      [inicioIso, fimIso]
    ),
    semanticMemoryQueryRows(
      `SELECT COUNT(*) as total FROM semantic_memory_events WHERE tipo = 'decisao' AND timestamp >= ? AND timestamp < ?`,
      [inicioIso, fimIso]
    ),
  ]);
  return {
    eventos: Number((eventosDia as Array<{ total: number }>)[0]?.total ?? 0),
    padroes: Number((padroesDia as Array<{ total: number }>)[0]?.total ?? 0),
    decisoes: Number((decisoesDia as Array<{ total: number }>)[0]?.total ?? 0),
  };
}

export async function saveSemanticMemorySummary(resumo: SemanticSummary): Promise<void> {
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
}

export async function querySemanticMemory(query: MemoryQuery): Promise<{
  eventos: SemanticMemoryEvent[];
  padroes: SemanticPattern[];
  resumos: SemanticSummary[];
}> {
  let whereClause = "WHERE 1=1";
  const params: unknown[] = [];
  if (query.contexto) {
    whereClause += " AND contexto = ?";
    params.push(query.contexto);
  }
  if (query.entidade) {
    whereClause += " AND entidade = ?";
    params.push(query.entidade);
  }
  if (query.tipo) {
    whereClause += " AND tipo = ?";
    params.push(query.tipo);
  }
  if (query.periodo) {
    whereClause += " AND timestamp >= ? AND timestamp <= ?";
    params.push(query.periodo.inicio.toISOString(), query.periodo.fim.toISOString());
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

export async function deleteOldSemanticMemory(iso: string): Promise<void> {
  await semanticMemoryExecuteMany([
    { sql: `DELETE FROM semantic_memory_events WHERE timestamp < ?`, params: [iso] },
    { sql: `DELETE FROM semantic_memory_patterns WHERE criado_em < ?`, params: [iso] },
    { sql: `DELETE FROM semantic_memory_summaries WHERE criado_em < ?`, params: [iso] },
  ]);
}
