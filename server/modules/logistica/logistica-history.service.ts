/**
 * Serviço de histórico de rotas: gravação e consulta para relatórios e aprendizado do LEO.
 */
import * as logisticaService from "../../services/logistica.service.js";

export async function registrarEntregaNoHistorico(tenantId: number, registro: {
  cargaId: number;
  cidade: string;
  bairro?: string | null;
  ordemEntrega: number;
  tempoEntrega?: number | null;
}) {
  return await logisticaService.insertHistoricoRota(tenantId, registro);
}

export async function listarHistoricoRotas(tenantId: number, filtros?: {
  cargaId?: number;
  cidade?: string;
  dataInicio?: Date;
  dataFim?: Date;
}) {
  return await logisticaService.listHistoricoRotas(tenantId, filtros);
}

export async function ultimaCargaPorCidade(tenantId: number, cidade: string): Promise<Record<string, unknown> | null> {
  const cargas = await logisticaService.listCargas(tenantId);
  const list = Array.isArray(cargas) ? cargas : [];
  const filtradas = list.filter(
    (c: Record<string, unknown>) => (String(c.cidadeRota ?? "").toLowerCase()) === cidade.toLowerCase()
  );
  if (filtradas.length === 0) return null;
  filtradas.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    new Date((b.createdAt as string) || 0).getTime() - new Date((a.createdAt as string) || 0).getTime()
  );
  return filtradas[0] as Record<string, unknown>;
}

export async function cargasPorPeriodo(tenantId: number, dataInicio: Date, dataFim: Date): Promise<Record<string, unknown>[]> {
  const cargas = await logisticaService.listCargas(tenantId);
  const list = Array.isArray(cargas) ? cargas : [];
  return list.filter((c: Record<string, unknown>) => {
    const d = c.dataEntrega ? new Date(c.dataEntrega as string) : new Date((c.createdAt as string) || 0);
    return d >= dataInicio && d <= dataFim;
  });
}
