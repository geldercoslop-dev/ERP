/**
 * Tipos de produto — entidade Produto e Cor vêm de entities.ts
 */
import type { produtos } from "./entities.js";

type ProdutoType = typeof produtos.$inferSelect;

export type Product = ProdutoType;

export type Produto = ProdutoType;

export interface CreateProductData {
  nome: string;
  descricao?: string;
  preco: number;
  precoCusto?: number;
  estoque: number;
  estoqueMinimo: number;
  unidade: string;
  categoria?: string;
  corId?: number;
}

export interface UpdateProductData {
  nome?: string;
  descricao?: string;
  preco?: number;
  precoCusto?: number;
  estoque?: number;
  estoqueMinimo?: number;
  unidade?: string;
  categoria?: string;
  corId?: number;
  ativo?: boolean;
}

export interface ProductFilter {
  nome?: string;
  categoria?: string;
  ativo?: boolean;
  estoqueBaixo?: boolean;
  limite?: number;
}

export interface StockOperation {
  produtoId: number;
  quantidade: number;
  tipo: "entrada" | "saida";
  motivo?: string;
}
