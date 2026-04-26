import { relations } from "drizzle-orm/relations";
import { cargas, comissoes, pedidos, vendedores, fornecedores, contasFixas, planoContas, contasPagar, clientes, contasReceber, cores, itensPedido, produtos, pedidosCarga, pendenciasCompra, tenants, users } from "./schema";

export const comissoesRelations = relations(comissoes, ({one}) => ({
	cargas: one(cargas, {
		fields: [comissoes.cargaId],
		references: [cargas.id]
	}),
	pedido: one(pedidos, {
		fields: [comissoes.pedidoId],
		references: [pedidos.id]
	}),
	vendedore: one(vendedores, {
		fields: [comissoes.vendedorId],
		references: [vendedores.id]
	}),
}));

export const cargasRelations = relations(cargas, ({many}) => ({
	comissoes: many(comissoes),
	pedidosCargas: many(pedidosCarga),
}));

export const pedidosRelations = relations(pedidos, ({one, many}) => ({
	comissoes: many(comissoes),
	contasRecebers: many(contasReceber),
	itensPedidos: many(itensPedido),
	cliente: one(clientes, {
		fields: [pedidos.clienteId],
		references: [clientes.id]
	}),
	vendedore: one(vendedores, {
		fields: [pedidos.vendedorId],
		references: [vendedores.id]
	}),
	pedidosCargas: many(pedidosCarga),
}));

export const vendedoresRelations = relations(vendedores, ({one, many}) => ({
	comissoes: many(comissoes),
	pedidos: many(pedidos),
	tenant: one(tenants, {
		fields: [vendedores.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [vendedores.userId],
		references: [users.id]
	}),
}));

export const contasFixasRelations = relations(contasFixas, ({one, many}) => ({
	fornecedore: one(fornecedores, {
		fields: [contasFixas.fornecedorId],
		references: [fornecedores.id]
	}),
	planoConta: one(planoContas, {
		fields: [contasFixas.planoContasId],
		references: [planoContas.id]
	}),
	contasPagars: many(contasPagar),
}));

export const fornecedoresRelations = relations(fornecedores, ({many}) => ({
	contasFixas: many(contasFixas),
	contasPagars: many(contasPagar),
}));

export const planoContasRelations = relations(planoContas, ({many}) => ({
	contasFixas: many(contasFixas),
	contasPagars: many(contasPagar),
	contasRecebers: many(contasReceber),
}));

export const contasPagarRelations = relations(contasPagar, ({one}) => ({
	contasFixa: one(contasFixas, {
		fields: [contasPagar.contaFixaId],
		references: [contasFixas.id]
	}),
	fornecedore: one(fornecedores, {
		fields: [contasPagar.fornecedorId],
		references: [fornecedores.id]
	}),
	planoConta: one(planoContas, {
		fields: [contasPagar.planoContasId],
		references: [planoContas.id]
	}),
}));

export const contasReceberRelations = relations(contasReceber, ({one}) => ({
	cliente: one(clientes, {
		fields: [contasReceber.clienteId],
		references: [clientes.id]
	}),
	pedido: one(pedidos, {
		fields: [contasReceber.pedidoId],
		references: [pedidos.id]
	}),
	planoConta: one(planoContas, {
		fields: [contasReceber.planoContasId],
		references: [planoContas.id]
	}),
}));

export const clientesRelations = relations(clientes, ({many}) => ({
	contasRecebers: many(contasReceber),
	pedidos: many(pedidos),
}));

export const itensPedidoRelations = relations(itensPedido, ({one}) => ({
	core: one(cores, {
		fields: [itensPedido.corId],
		references: [cores.id]
	}),
	pedido: one(pedidos, {
		fields: [itensPedido.pedidoId],
		references: [pedidos.id]
	}),
	produto: one(produtos, {
		fields: [itensPedido.produtoId],
		references: [produtos.id]
	}),
}));

export const coresRelations = relations(cores, ({many}) => ({
	itensPedidos: many(itensPedido),
}));

export const produtosRelations = relations(produtos, ({many}) => ({
	itensPedidos: many(itensPedido),
	pendenciasCompras: many(pendenciasCompra),
}));

export const pedidosCargaRelations = relations(pedidosCarga, ({one}) => ({
	cargas: one(cargas, {
		fields: [pedidosCarga.cargaId],
		references: [cargas.id]
	}),
	pedido: one(pedidos, {
		fields: [pedidosCarga.pedidoId],
		references: [pedidos.id]
	}),
}));

export const pendenciasCompraRelations = relations(pendenciasCompra, ({one}) => ({
	produto: one(produtos, {
		fields: [pendenciasCompra.produtoId],
		references: [produtos.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [users.tenantId],
		references: [tenants.id]
	}),
	vendedores: many(vendedores),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	users: many(users),
	vendedores: many(vendedores),
}));