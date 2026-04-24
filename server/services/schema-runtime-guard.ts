import { sql } from 'drizzle-orm';
import type { Database } from '../db/core.js';
import type { CountRow, InformationSchemaColumn, InformationSchemaTable } from '../types/database.types.js';
import { safeGet } from '../types/database.types.js';

/**
 * Runtime Schema Guard - Executado durante bootstrap
 * Valida schema do banco em runtime e falha com mensagem clara
 */

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: Record<string, unknown>;
}

/**
 * Valida schema em runtime - executado após migrations
 * @param db - Drizzle database connection
 * @returns Resultado da validação com erros e warnings
 */
export async function validateSchemaAtRuntime(db: Database): Promise<SchemaValidationResult> {
  const result: SchemaValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    details: {},
  };

  try {
    console.log('[SCHEMA_GUARD] Iniciando validação de schema em runtime...');

    // 1. Verificar estrutura básica da tabela users
    console.log('[SCHEMA_GUARD] Verificando tabela users...');
    try {
      const usersCheck = await db.execute(
        sql`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'erp' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'tenant_id'`
      );
      
      const rows = usersCheck && typeof usersCheck === 'object' && 'rows' in usersCheck
        ? (usersCheck as { rows?: unknown[] }).rows
        : undefined;
      const countRow = safeGet<CountRow & Record<string, unknown>>(
        rows,
        0
      );

      if ((countRow?.count ?? 0) === 0) {
        result.errors.push('Tabela users está sem coluna tenant_id');
        result.valid = false;
      } else {
        console.log('[SCHEMA_GUARD] ✓ Tabela users tem tenant_id');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Erro ao verificar users: ${message}`);
      result.valid = false;
    }

    // 2. Verificar estrutura da tabela vendedores
    console.log('[SCHEMA_GUARD] Verificando tabela vendedores...');
    try {
      const vendedoresCheck = await db.execute(
        sql`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'erp' AND TABLE_NAME = 'vendedores' AND COLUMN_NAME = 'tenant_id'`
      );
      
      const rows = vendedoresCheck && typeof vendedoresCheck === 'object' && 'rows' in vendedoresCheck
        ? (vendedoresCheck as { rows?: unknown[] }).rows
        : undefined;
      const countRow = safeGet<CountRow & Record<string, unknown>>(
        rows,
        0
      );

      if ((countRow?.count ?? 0) === 0) {
        result.errors.push('Tabela vendedores está sem coluna tenant_id');
        result.valid = false;
      } else {
        console.log('[SCHEMA_GUARD] ✓ Tabela vendedores tem tenant_id');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Erro ao verificar vendedores: ${message}`);
      result.valid = false;
    }

    // 3. Verificar coluna user_id em vendedores (snake_case)
    console.log('[SCHEMA_GUARD] Verificando nomenclatura vendedores.user_id (snake_case)...');
    try {
      const userIdCheck = await db.execute(
        sql`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'erp' AND TABLE_NAME = 'vendedores' AND COLUMN_NAME = 'user_id'`
      );
      
      const rows = userIdCheck && typeof userIdCheck === 'object' && 'rows' in userIdCheck
        ? (userIdCheck as { rows?: unknown[] }).rows
        : undefined;
      const countRow = safeGet<CountRow & Record<string, unknown>>(
        rows,
        0
      );

      if ((countRow?.count ?? 0) === 0) {
        result.errors.push('Coluna vendedores.user_id não encontrada (verificar se está em snake_case)');
        result.valid = false;
      } else {
        console.log('[SCHEMA_GUARD] ✓ vendedores.user_id em snake_case');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`Aviso ao verificar user_id: ${message}`);
    }

    // 4. Verificar coluna open_id em users (snake_case)
    console.log('[SCHEMA_GUARD] Verificando nomenclatura users.open_id (snake_case)...');
    try {
      const openIdCheck = await db.execute(
        sql`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'erp' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'open_id'`
      );
      
      const rows = openIdCheck && typeof openIdCheck === 'object' && 'rows' in openIdCheck
        ? (openIdCheck as { rows?: unknown[] }).rows
        : undefined;
      const countRow = safeGet<CountRow & Record<string, unknown>>(
        rows,
        0
      );

      if ((countRow?.count ?? 0) === 0) {
        result.errors.push('Coluna users.open_id não encontrada (verificar se está em snake_case)');
        result.valid = false;
      } else {
        console.log('[SCHEMA_GUARD] ✓ users.open_id em snake_case');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.warnings.push(`Aviso ao verificar open_id: ${message}`);
    }

    // 5. Verificar tabela tenants
    console.log('[SCHEMA_GUARD] Verificando tabela tenants...');
    try {
      const tenantsCheck = await db.execute(
        sql`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'erp' AND TABLE_NAME = 'tenants'`
      );
      
      const rows = tenantsCheck && typeof tenantsCheck === 'object' && 'rows' in tenantsCheck
        ? (tenantsCheck as { rows?: unknown[] }).rows
        : undefined;
      const countRow = safeGet<CountRow & Record<string, unknown>>(
        rows,
        0
      );

      if ((countRow?.count ?? 0) === 0) {
        result.errors.push('Tabela tenants não existe');
        result.valid = false;
      } else {
        console.log('[SCHEMA_GUARD] ✓ Tabela tenants existe');
        
        // Verificar se tem pelo menos 1 tenant
        const tenantsCount = await db.execute(sql`SELECT COUNT(*) as count FROM tenants`);
        const countRows = tenantsCount && typeof tenantsCount === 'object' && 'rows' in tenantsCount
          ? (tenantsCount as { rows?: unknown[] }).rows
          : undefined;
        const tenantsCountRow = safeGet<CountRow & Record<string, unknown>>(
          countRows,
          0
        );
        const count = tenantsCountRow?.count ?? 0;
        result.details.tenantsCount = count;
        
        if (count === 0) {
          result.errors.push('Nenhum tenant configurado (pelo menos 1 obrigatório)');
          result.valid = false;
        } else {
          console.log(`[SCHEMA_GUARD] ✓ ${count} tenant(s) configurado(s)`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Erro ao verificar tenants: ${message}`);
      result.valid = false;
    }

    // Print resultado final
    console.log('\n' + '='.repeat(60));
    if (!result.valid) {
      console.error('\n[SCHEMA_GUARD] 🚨 VALIDAÇÃO FALHOU:\n');
      result.errors.forEach(e => console.error(`  ❌ ${e}`));
      console.error('\n[SCHEMA_GUARD] 💥 Schema inválido! O banco pode estar corrompido ou desatualizado.');
      console.error('[SCHEMA_GUARD] 💡 Sugestões:');
      console.error('   1. Execute: docker-compose down -v && docker-compose up --build');
      console.error('   2. Verifique as migrations em /app/drizzle/');
      console.error('   3. Consulte: BACKEND_INFRASTRUCTURE_FINAL_REPORT.txt\n');
    } else {
      console.log('\n[SCHEMA_GUARD] ✅ Schema válido e consistente!\n');
    }

    if (result.warnings.length > 0) {
      console.warn('[SCHEMA_GUARD] ⚠️ Avisos:\n');
      result.warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
      console.warn('');
    }

    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SCHEMA_GUARD] 💥 Erro durante validação:', message);
    result.valid = false;
    result.errors.push(`Erro crítico durante validação: ${message}`);
    return result;
  }
}
