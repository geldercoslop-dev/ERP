import { z } from "zod";
import type { LeoAction, LeoActionPayloadMap } from "./leoAction.service.js";
import { ValidationError } from "../_core/errors/typed-errors.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const pedidoItemSchema = z.object({
  tipo: z.enum(["LIVRE", "CATALOGO"]),
  descricao: z.string().min(1),
  quantidade: z.number().int().positive(),
  valorUnitario: z.number(),
  custo: z.number(),
  produtoId: z.number().int().positive().optional(),
  corId: z.number().int().positive().optional().nullable(),
  corNome: z.string().optional().nullable(),
  marca: z.string().optional().nullable(),
  prazoGarantia: z.number().int().nonnegative().optional(),
  isPremio: z.boolean().optional(),
});

const createOrderPayloadSchema = z.object({
  vendedorId: z.number().int().positive(),
  clienteId: z.number().int().positive(),
  clienteNome: z.string().min(1),
  subtotal: z.number(),
  desconto: z.number(),
  frete: z.number(),
  total: z.number(),
  itens: z.array(pedidoItemSchema).min(1),
  observacoes: z.string().optional(),
  formaPagamento: z.string().optional(),
});

const processPaymentPayloadSchema = z.object({
  contaId: z.number().int().positive(),
  dataRecebimento: z.string().min(1),
  formaPagamento: z.string().min(1),
});

const registerSalePayloadSchema = z.object({
  vendedorId: z.number().int().positive(),
  clienteId: z.number().int().positive(),
  clienteNome: z.string().min(1),
  total: z.number().positive(),
});

export function parseLeoActionPayload(action: LeoAction, raw: unknown): LeoActionPayloadMap[LeoAction] {
  if (!isRecord(raw)) {
    throw new ValidationError("Payload deve ser um objeto.");
  }
  const recordRaw = raw as Record<string, unknown>;
  switch (action) {
    case "CREATE_ORDER":
      return createOrderPayloadSchema.parse(recordRaw);
    case "PROCESS_PAYMENT":
      return processPaymentPayloadSchema.parse(recordRaw);
    case "REGISTER_SALE":
      return registerSalePayloadSchema.parse(recordRaw);
  }
}
