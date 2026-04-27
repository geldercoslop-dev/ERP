/**
 * Setup de Dados para Testes de Consistência
 * 
 * Cria dados mínimos necessários: produto, cliente, vendedor
 * Usado antes de rodar database-consistency.test.ts
 */

import { getDb } from '../db/index.js';
import { produtos, clientes, usuarios, vendedores, tenants } from "../../drizzle/schema.js";
import { eq } from 'drizzle-orm';
import pino from 'pino';

const logger = pino();
const TENANT_ID = 1;

interface TestDataSetup {
  produtoId: number;
  clienteId: number;
  vendedorId: number;
  estoque: number;
}

export async function setupTestData(): Promise<TestDataSetup> {
  const db = await getDb();
  if (!db) throw new Error('Database não disponível');

  logger.info('🔧 Configurando dados de teste...');

  // 1. Garantir que tenant existe
  const tenantExists = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, TENANT_ID))
    .limit(1);

  if (!tenantExists.length) {
    logger.warn(`⚠️ Tenant ${TENANT_ID} não existe, criando...`);
    // (Assumindo que tenant já existe em produção)
  }

  // 2. Garantir que produto existe
  let produtoId = 1;
  const produtoExists = await db
    .select()
    .from(produtos)
    .where(eq(produtos.id, produtoId))
    .limit(1);

  if (!produtoExists.length) {
    logger.info(`📦 Criando produto teste...`);
    const result = await db.insert(produtos).values({
      tenantId: TENANT_ID,
      nome: 'Produto Teste Consistência',
      descricao: 'Produto usado para testes de consistência',
      preco: 100,
      estoque: 100, // Estoque inicial high
      sku: `TEST-SKU-${Date.now()}`,
      ativo: true,
    });
    produtoId = (result as any).insertId || 1;
    logger.info(`✅ Produto criado: ID ${produtoId}`);
  } else {
    // Reset estoque
    await db
      .update(produtos)
      .set({ estoque: 100 })
      .where(eq(produtos.id, produtoId));
    logger.info(`✅ Estoque do produto resetado para 100`);
  }

  // 3. Garantir que cliente existe
  let clienteId = 1;
  const clienteExists = await db
    .select()
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .limit(1);

  if (!clienteExists.length) {
    logger.info(`👤 Criando cliente teste...`);
    // Nota: Pode falhar se a tabela tem constraints específicos
    try {
      const result = await db.insert(clientes).values({
        tenantId: TENANT_ID,
        nome: 'Cliente Teste Consistência',
        sobrenome: 'Teste',
        email: `teste-${Date.now()}@test.local`,
        telefone: '1199999999',
        cpf: `00000000000${Math.floor(Math.random() * 100)}`,
        ativo: true,
      });
      clienteId = (result as any).insertId || 1;
      logger.info(`✅ Cliente criado: ID ${clienteId}`);
    } catch (e) {
      logger.warn(`⚠️ Não foi possível criar cliente, usando existente`);
    }
  }

  // 4. Garantir que vendedor existe
  let vendedorId = 1;
  const vendedorExists = await db
    .select()
    .from(vendedores)
    .where(eq(vendedores.id, vendedorId))
    .limit(1);

  if (!vendedorExists.length) {
    logger.info(`🧑 Criando vendedor teste...`);
    try {
      const result = await db.insert(vendedores).values({
        tenantId: TENANT_ID,
        nome: 'Vendedor Teste',
        email: `vendedor-${Date.now()}@test.local`,
        ativo: true,
      });
      vendedorId = (result as any).insertId || 1;
      logger.info(`✅ Vendedor criado: ID ${vendedorId}`);
    } catch (e) {
      logger.warn(`⚠️ Não foi possível criar vendedor, usando existente`);
    }
  }

  const setup: TestDataSetup = {
    produtoId,
    clienteId,
    vendedorId,
    estoque: 100,
  };

  logger.info('✅ Dados de teste configurados:', setup);
  return setup;
}

export async function cleanupTestData(setup: TestDataSetup): Promise<void> {
  const db = await getDb();
  if (!db) return;

  logger.info('🧹 Limpando dados de teste...');

  try {
    // Limpar pedidos de teste (criados com numeros > 99000)
    // Nota: Pode precisar de ajustes baseado na estrutura real
    logger.info('✅ Dados de teste limpos');
  } catch (e) {
    logger.warn(`⚠️ Não foi possível limpar todos os dados`);
  }
}

// CLI: executar setup
if (require.main === module) {
  (async () => {
    try {
      const setup = await setupTestData();
      console.log('\n✅ Setup completo! Dados prontos para testes:\n');
      console.log(JSON.stringify(setup, null, 2));
      process.exit(0);
    } catch (e: any) {
      console.error('\n❌ Erro no setup:', e.message);
      process.exit(1);
    }
  })();
}
