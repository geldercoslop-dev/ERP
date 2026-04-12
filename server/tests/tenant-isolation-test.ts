import { getDb } from '../db/index.js';
import { pedidos } from '../../drizzle/schema.js';
import { sql } from 'drizzle-orm';
import { safeTransactionService } from '../services/safe-transaction';
import { runWithServiceInvocationAsync, buildBootstrapInvocation } from '../_core/service-entry-guard.js';

/** BD de teste pode estar vazio — garante tabelas mínimas sem alterar .env nem migrações antigas quebradas. */
async function ensureTenantIsolationTestSchema(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<void> {
  await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS \`audit_logs\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenant_id\` int NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT (now()),
  \`actor_user_id\` int,
  \`actor_vendedor_id\` int,
  \`action\` varchar(32) NOT NULL,
  \`entity\` varchar(64) NOT NULL,
  \`entity_id\` varchar(64),
  \`payload_json\` text,
  \`trace_id\` varchar(32),
  \`ip\` varchar(45),
  \`user_agent\` text,
  \`severity\` varchar(10) NOT NULL DEFAULT 'INFO',
  \`source\` varchar(20) NOT NULL DEFAULT 'api',
  CONSTRAINT \`audit_logs_id\` PRIMARY KEY(\`id\`),
  KEY \`audit_entity_idx\` (\`entity\`),
  KEY \`audit_entity_id_idx\` (\`entity_id\`),
  KEY \`audit_created_at_idx\` (\`created_at\`),
  KEY \`audit_ip_idx\` (\`ip\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`));
  await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS \`pedidos\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`tenant_id\` int NOT NULL,
  \`numero\` int NOT NULL DEFAULT 0,
  \`vendedor_id\` int NOT NULL DEFAULT 1,
  \`cliente_id\` int NOT NULL DEFAULT 1,
  \`cliente_nome\` varchar(255) NOT NULL DEFAULT 'test',
  \`cliente_telefone\` varchar(20) DEFAULT NULL,
  \`cliente_telefone_recado\` varchar(20) DEFAULT NULL,
  \`cliente_rua\` text,
  \`cliente_numero\` varchar(20) DEFAULT NULL,
  \`cliente_bairro\` varchar(100) DEFAULT NULL,
  \`cliente_cidade\` varchar(100) DEFAULT NULL,
  \`cliente_uf\` varchar(2) DEFAULT NULL,
  \`cliente_referencia\` text,
  \`cliente_condominio\` text,
  \`cliente_bloco\` varchar(50) DEFAULT NULL,
  \`cliente_apartamento\` varchar(50) DEFAULT NULL,
  \`subtotal\` decimal(10,2) NOT NULL DEFAULT '0',
  \`desconto\` decimal(10,2) NOT NULL DEFAULT '0',
  \`frete\` decimal(10,2) NOT NULL DEFAULT '0',
  \`acrescimo\` decimal(10,2) NOT NULL DEFAULT '0',
  \`total\` decimal(10,2) NOT NULL DEFAULT '0',
  \`data_criacao\` timestamp NOT NULL DEFAULT (now()),
  \`status\` varchar(50) NOT NULL,
  \`forma_pagamento\` varchar(100) DEFAULT NULL,
  \`data_entrega\` timestamp NULL DEFAULT NULL,
  \`garantia_inicio\` timestamp NULL DEFAULT NULL,
  \`observacoes\` text,
  \`conferido_em\` timestamp NULL DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT (now()),
  \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`pedidos_numero_unique\` (\`numero\`),
  KEY \`pedidos_tenant_id_idx\` (\`tenant_id\`),
  KEY \`pedidos_vendedor_idx\` (\`vendedor_id\`),
  KEY \`pedidos_cliente_idx\` (\`cliente_id\`),
  KEY \`pedidos_status_idx\` (\`status\`),
  KEY \`pedidos_numero_idx\` (\`numero\`),
  KEY \`pedidos_created_at_idx\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`));
  await db.execute(
    sql.raw('DELETE FROM `pedidos` WHERE `tenant_id` IN (1001, 2002)')
  );
}

async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error('Database não disponível');
  }
  await ensureTenantIsolationTestSchema(db);

  // IDs fictícios para tenants
  const tenantA = 1001;
  const tenantB = 2002;

  // 1. Criar pedido no tenant A
  let pedidoId: number;
  const numeroPedido = Math.floor(Math.random() * 2_000_000_000) + 1;
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(pedidos)
      .values({
        tenantId: tenantA,
        numero: numeroPedido,
        status: 'GERADO',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    pedidoId = inserted.insertId || inserted.id;
  });

  // 2. Ataque cross-tenant: tenant B tenta update/delete/status
  let updateError, deleteError, statusError;
  await db.transaction(async (tx) => {
    try {
      await safeTransactionService.atualizarPedido(tx, { pedidoId, tenantId: tenantB, dados: { status: 'CANCELADO' } });
    } catch (err) {
      updateError = err;
    }
    try {
      await safeTransactionService.cancelarPedido(tx, { pedidoId, tenantId: tenantB, dados: { motivo: 'Ataque' } });
    } catch (err) {
      deleteError = err;
    }
    try {
      await safeTransactionService.atualizarStatusPedido(tx, { pedidoId, tenantId: tenantB, dados: { status: 'ENTREGUE' } });
    } catch (err) {
      statusError = err;
    }
  });

  // 3. Operação válida: tenant A pode alterar normalmente
  let validUpdate = false;
  await db.transaction(async (tx) => {
    try {
      await safeTransactionService.atualizarPedido(tx, { pedidoId, tenantId: tenantA, dados: { status: 'CANCELADO' } });
      validUpdate = true;
    } catch {}
  });

  // 4. Log real do resultado
  console.log('Update cross-tenant erro:', updateError?.message);
  console.log('Delete cross-tenant erro:', deleteError?.message);
  console.log('Status cross-tenant erro:', statusError?.message);
  console.log('Update válido tenant A:', validUpdate);

  // 5. Assertiva final
  if (
    updateError?.message?.toLowerCase().includes('não encontrado') &&
    deleteError?.message?.toLowerCase().includes('não encontrado') &&
    (statusError?.message?.toLowerCase().includes('acesso negado') || statusError?.message?.toLowerCase().includes('não encontrado')) &&
    validUpdate === true
  ) {
    console.log('✔ PROVA REAL: Isolamento multi-tenant garantido no banco.');
  } else {
    throw new Error('❌ FALHA DE ISOLAMENTO');
  }
}

const tenantA = 1001;

runWithServiceInvocationAsync(
  buildBootstrapInvocation(tenantA),
  async () => {
    await main();
  }
);