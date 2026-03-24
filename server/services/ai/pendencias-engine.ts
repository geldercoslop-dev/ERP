/**
 * Motor de pendências e lista de compras do LEO.
 * Usa as pendências de pedidos existentes no ERP.
 */
import * as db from "../leo-erp-data.facade";

/** Lista pendências de estoque (pendências ativas: PENDENTE ou COMPRADO). */
export async function listarPendenciasEstoque(vendedorId?: number): Promise<
  { produtoId: number; descricao: string; marca: string | null; quantidade: number; qtdPedidos: number }[]
> {
  try {
    // TODO: Implementar função listPendenciasAgregadasPorProduto
    // const rows = await db.listPendenciasAgregadasPorProduto(vendedorId);
    const rows: Record<string, unknown>[] = [];
    return (rows as Array<{
      produtoId: number;
      descricao: string;
      marca: string | null;
      quantidade: string | number;
      qtdPedidos: string | number;
    }>).map((r) => ({
      produtoId: r.produtoId,
      descricao: r.descricao ?? "",
      marca: r.marca ?? null,
      quantidade: Number(r.quantidade ?? 0),
      qtdPedidos: Number(r.qtdPedidos ?? 0),
    }));
  } catch (e: unknown) {
    console.error("[LEO pendencias-engine] Erro ao listar pendências:", (e as Error)?.message ?? e);
    return [];
  }
}

/** Gera lista de compras (produtos faltando / a comprar) a partir das pendências agrupadas por produto. */
export async function gerarListaCompras(vendedorId?: number): Promise<
  { descricao: string; marca: string | null; quantidade: number; fornecedor: string | null }[]
> {
  try {
    // TODO: Implementar função listPendenciasCompraPorFornecedor
    // const porFornecedor = await db.listPendenciasCompraPorFornecedor({
    //   vendedorId,
    //   incluirComprado: false,
    // });
    const porFornecedor: Record<string, unknown>[] = [];
    const agregado = new Map<
      string,
      { descricao: string; marca: string | null; quantidade: number; fornecedor: string | null }
    >();
    for (const r of porFornecedor as Array<{
      produtoId: number;
      fornecedor: string | null;
      descricao: string;
      marca: string | null;
      quantidade: string | number;
    }>) {
      const key = `${r.produtoId}-${r.fornecedor ?? ""}`;
      const descricao = r.descricao ?? "";
      const marca = r.marca ?? null;
      const fornecedor = r.fornecedor ?? null;
      const qtd = Number(r.quantidade ?? 0);
      if (agregado.has(key)) {
        const exist = agregado.get(key)!;
        exist.quantidade += qtd;
      } else {
        agregado.set(key, { descricao, marca, quantidade: qtd, fornecedor });
      }
    }
    return Array.from(agregado.values());
  } catch (e: unknown) {
    console.error("[LEO pendencias-engine] Erro ao gerar lista de compras:", (e as Error)?.message ?? e);
    return [];
  }
}
