#!/usr/bin/env tsx

// Configurar variáveis de ambiente para teste
process.env.DATABASE_URL = "mysql://root:root@127.0.0.1:3306/test";
process.env.JWT_ACCESS_SECRET = "b5af11974886dd957d214781b4e3da4f3ec3ad71e47d2ed3c61a3305b11cabc83f17eca81c17a2fc3d78bb2dda37fc0687787ad9c74b735b949372dfd8f13de0";
process.env.JWT_REFRESH_SECRET = "d515281080a3a01625e7fe94d5f7ebff8643cc968667cc6a49cace9f33ca40612d459aa9275f5592fd453df841e358be1418fc246f8d049cde6ce23e6dbb1ce4";
process.env.JWT_SECRET = "3a1b81f6e5e4b9a0f04f8e60586b4fcb1b5df276ea7a5d4433cd986c5e8195107c8bb710d195450d64f7c5122b4bd3cc24b029194ca3ede4aedb4fffd3334cde";
process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "6379";
process.env.SERVICE_ENTRY_GUARD = "0";

import { getDb } from '../server/db/index.js';
import { tenants, users, vendedores } from "../drizzle/schema.js";
import { runWithServiceInvocationAsync, buildBootstrapInvocation } from '../server/_core/service-entry-guard.js';
import { format } from 'node:util';

const writeOut = (...args: unknown[]): void => {
  process.stdout.write(format(...args) + "\n");
};

const writeErr = (...args: unknown[]): void => {
  process.stderr.write(format(...args) + "\n");
};
async function setupTestDatabase() {
  writeOut('🧪 Configurando banco de dados de teste...');
  
  return await runWithServiceInvocationAsync(buildBootstrapInvocation(1), async () => {
    const db = await getDb();
    
    try {
      // Inserir tenant padrão
      await db.insert(tenants).values({
        id: 1,
        nome: 'Tenant Teste',
        ativo: true,
      }).onDuplicateKeyUpdate({
        set: {
          nome: 'Tenant Teste',
          ativo: true,
        }
      });
      writeOut('✅ Tenant padrão criado');
      
      // Inserir usuário admin
      await db.insert(users).values({
        id: 1,
        tenantId: 1,
        openId: 'admin',
        name: 'Administrador',
        email: 'admin@test.com',
        role: 'admin',
      }).onDuplicateKeyUpdate({
        set: {
          name: 'Administrador',
          email: 'admin@test.com',
          role: 'admin',
        }
      });
      writeOut('✅ Usuário admin criado');
      
      // Inserir vendedor de teste
      await db.insert(vendedores).values({
        id: 1,
        tenantId: 1,
        userId: 1,
        nome: 'Vendedor Teste',
        telefone: '27999999999',
        ativo: true,
        admin: false,
      }).onDuplicateKeyUpdate({
        set: {
          nome: 'Vendedor Teste',
          telefone: '27999999999',
          ativo: true,
          admin: false,
        }
      });
      writeOut('✅ Vendedor de teste criado');
      
      writeOut('🎉 Banco de dados de teste configurado com sucesso!');
    } catch (error) {
      writeErr('❌ Erro ao configurar banco de teste:', error);
      throw error;
    }
  });
}

setupTestDatabase().catch((error) => writeErr(error instanceof Error ? error.message : String(error)));

