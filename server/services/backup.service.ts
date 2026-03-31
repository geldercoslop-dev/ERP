/**
 * Serviço de backup completo - exporta dados das tabelas principais para ZIP.
 * Usado por backup.ts e infra/backup.
 */

import { getDb } from "../db/core.js";
import * as schema from "../../drizzle/schema.js";

export type BackupData = {
  dataBackup: string;
  produtos: unknown[];
  clientes: unknown[];
  vendedores: unknown[];
  pedidos: unknown[];
  cores: unknown[];
  fornecedores: unknown[];
  planoContas: unknown[];
  contasFixas: unknown[];
  contasPagar: unknown[];
  contasReceber: unknown[];
  comissoes: unknown[];
  cargas: unknown[];
};

export async function gerarBackupCompleto(): Promise<BackupData> {
  const db = await getDb();
  const [
    produtos,
    clientes,
    vendedores,
    pedidos,
    cores,
    planoContas,
    contasFixas,
    contasPagar,
    contasReceber,
    comissoes,
    cargas,
  ] = await Promise.all([
    db.select().from(schema.produtos),
    db.select().from(schema.clientes),
    db.select().from(schema.vendedores),
    db.select().from(schema.pedidos),
    db.select().from(schema.cores),
    db.select().from(schema.planoContas),
    db.select().from(schema.contasFixas),
    db.select().from(schema.contasPagar),
    db.select().from(schema.contasReceber),
    db.select().from(schema.comissoes),
    db.select().from(schema.cargas),
  ]);

  return {
    dataBackup: new Date().toISOString(),
    produtos,
    clientes,
    vendedores,
    pedidos,
    cores,
    fornecedores: [], // tabela não existe no schema atual
    planoContas,
    contasFixas,
    contasPagar,
    contasReceber,
    comissoes,
    cargas,
  };
}
