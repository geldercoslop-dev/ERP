/**
 * Simula input inválido para validação (ex.: schema de pedido mínimo).
 * Uso: pnpm exec tsx scripts/simulate-invalid-service-input.ts
 */
import { z } from "zod";

const pedidoMinimo = z.object({
  clienteId: z.number().positive(),
  itens: z.array(z.object({ produtoId: z.number(), quantidade: z.number().positive() })).min(1),
});

const invalidos = [
  {},
  { clienteId: -1, itens: [] },
  { clienteId: 1, itens: [{ produtoId: 0, quantidade: 1 }] },
];

console.log("Simulação input inválido → esperado: falha de validação\n");
for (const input of invalidos) {
  const r = pedidoMinimo.safeParse(input);
  console.log(JSON.stringify(input), "=>", r.success ? "OK" : r.error.flatten());
}
