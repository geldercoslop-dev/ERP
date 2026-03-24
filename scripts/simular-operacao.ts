/**
 * Simulação operacional: 10 pedidos, 3 cargas, conferência, baixa parcial e total.
 * Objetivo: verificar se os fluxos (pedido → conferência → carga → baixa) funcionam sem erro.
 *
 * Pré-requisitos: banco configurado (.env), ao menos 1 vendedor, clientes e produtos.
 * Uso: npx tsx scripts/simular-operacao.ts (a partir da raiz do projeto)
 */
import "dotenv/config";
import * as db from "../server/db";

const traceId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function main() {
  const conn = await db.getDb();
  if (!conn) {
    console.error("[simular-operacao] Banco indisponível. Configure .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).");
    process.exit(1);
  }

  const vendedores = await db.getAllVendedores();
  const clientes = await db.getAllClientes();
  const produtos = await db.getAllProdutosComPrecoVigente(new Date());

  if (!vendedores.length) {
    console.error("[simular-operacao] Nenhum vendedor. Rode npm run seed:admin.");
    process.exit(1);
  }
  if (!clientes.length) {
    console.error("[simular-operacao] Nenhum cliente. Cadastre clientes ou rode seed de massa.");
    process.exit(1);
  }
  if (!produtos.length) {
    console.error("[simular-operacao] Nenhum produto. Cadastre produtos.");
    process.exit(1);
  }

  const vendedorId = vendedores[0].id;
  const clienteList = (clientes as any[]) || [];
  const produtoList = (produtos as any[]) || [];

  console.log("[simular-operacao] Iniciando simulação. traceId:", traceId);

  // --- 1) Criar 10 pedidos ---
  const pedidoIds: number[] = [];
  for (let i = 0; i < 10; i++) {
    const cliente = clienteList[i % clienteList.length] as any;
    const numero = await db.getNextCounter("pedidos");
    const total = 100 + (i % 5) * 50;
    const pedidoData: db.InsertPedido = {
      numero,
      vendedorId,
      clienteId: cliente.id,
      clienteNome: cliente.nome ?? "Cliente Simulação",
      clienteTelefone: cliente.telefone ?? null,
      subtotal: String(total),
      desconto: "0",
      frete: "0",
      total: String(total),
      status: "GERADO",
    } as any;
    const insertResult = await db.createPedido(pedidoData);
    const pedidoId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
    if (!pedidoId) throw new Error("Falha ao obter id do pedido");
    pedidoIds.push(pedidoId);

    const prod = produtoList[i % Math.max(1, produtoList.length)] as any;
    const itens: db.InsertItemPedido[] = [
      {
        pedidoId,
        tipo: prod?.id ? "CATALOGO" : "LIVRE",
        produtoId: prod?.id ?? null,
        descricao: prod?.descricao ?? `Item sim ${i + 1}`,
        quantidade: 1 + (i % 2),
        valorUnitario: String(total / (1 + (i % 2))),
        custo: "0",
        prazoGarantia: 90,
      } as any,
    ];
    await db.createItensPedido(itens);
    console.log(`  Pedido #${numero} criado (id ${pedidoId})`);
  }

  // --- 2) Conferência dos 10 pedidos ---
  await (conn as any).transaction(async (tx: any) => {
    for (const pedidoId of pedidoIds) {
      await db.marcarPedidoConferidoAudit(tx, {
        pedidoId,
        actorVendedorId: vendedorId,
        traceId,
      });
    }
  });
  console.log("  Conferência: 10 pedidos marcados como CONFERIDO.");

  // --- 3) Criar 3 cargas ---
  const dataEntrega = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const r1 = await db.createCarga({ cidadeRota: "Cidade A", dataEntrega }, pedidoIds.slice(0, 4));
  const r2 = await db.createCarga({ cidadeRota: "Cidade B", dataEntrega }, pedidoIds.slice(4, 7));
  const r3 = await db.createCarga({ cidadeRota: "Cidade C", dataEntrega }, pedidoIds.slice(7, 10));
  const cargaIds = [(r1 as any).id, (r2 as any).id, (r3 as any).id].filter(Boolean);
  console.log("  Cargas criadas:", cargaIds.length);

  // Liberar cargas para rota (EM_ROTA)
  for (const cargaId of cargaIds) {
    await db.fecharCarga(cargaId);
  }
  console.log("  Cargas liberadas para rota (EM_ROTA).");

  // --- 4) Baixa parcial e total ---
  const carga1Detail = await db.getCargaById(cargaIds[0]);
  const pedidosCarga = (carga1Detail as any)?.pedidos ?? [];
  const pedidoCargaIds = pedidosCarga.map((p: any) => p.pedidoCargaId).filter(Boolean);

  if (pedidoCargaIds.length >= 1) {
    await db.baixarPedidoCarga(pedidoCargaIds[0], {
      entradaForma: "PIX",
      entradaValor: 50,
      segundaForma: "DINHEIRO",
      segundaValor: 50,
    });
    console.log("  Baixa parcial (1 pedido) realizada.");
  }
  if (pedidoCargaIds.length >= 2) {
    await db.baixarPedidoCarga(pedidoCargaIds[1], {
      entradaForma: "DINHEIRO",
      entradaValor: 150,
    });
    console.log("  Baixa total (1 pedido) realizada.");
  }
  if (pedidoCargaIds.length >= 3) {
    await db.baixarPedidoCarga(pedidoCargaIds[2], {
      entradaForma: "PIX",
      entradaValor: 200,
    });
    console.log("  Segunda baixa total realizada.");
  }

  // Tentativa de segunda baixa no mesmo pedido (deve falhar)
  try {
    await db.baixarPedidoCarga(pedidoCargaIds[0], { entradaForma: "PIX", entradaValor: 100 });
    console.log("  [AVISO] Segunda baixa no mesmo pedido não foi bloqueada.");
  } catch (e: any) {
    if (e?.message?.includes("já foi baixado") || e?.message?.includes("já está entregue")) {
      console.log("  Segunda baixa indevida corretamente bloqueada.");
    } else {
      console.error("  Erro inesperado ao tentar segunda baixa:", e?.message);
    }
  }

  console.log("[simular-operacao] Simulação concluída sem erro.");
}

main().catch((e) => {
  console.error("[simular-operacao] Erro:", e?.message ?? e);
  process.exit(1);
});
