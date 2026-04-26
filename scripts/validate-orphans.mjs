import mysql from 'mysql2/promise';

const DB_URL = 'mysql://root:root@localhost:3306/erp';

async function validateOrphans() {
  const connection = await mysql.createConnection(DB_URL);
  
  try {
    console.log('🔍 Validando que migrations 0005-0008 NÃO existem no banco...\n');
    
    // Listar todas as migrations no banco
    const [migrations] = await connection.execute(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id"
    );
    
    console.log(`✓ Migrations aplicadas no banco: ${migrations.length}`);
    console.log(`✓ Detalhes:`);
    migrations.forEach((m, i) => {
      console.log(`  [${i}] ID: ${m.id}, Hash: ${m.hash.substring(0, 20)}..., Created: ${m.created_at}`);
    });
    
    // Verificar se alguma migration 0005-0008 existe
    const orphans = ['0005', '0006', '0007', '0008'];
    const foundOrphans = migrations.filter(m => 
      orphans.some(o => m.hash.includes(o) || m.created_at.toString().includes(o))
    );
    
    if (foundOrphans.length > 0) {
      console.log(`\n❌ ERRO: Encontradas ${foundOrphans.length} migrations órfãs aplicadas no banco!`);
      console.log('   NÃO é seguro remover os arquivos SQL.');
      process.exit(1);
    }
    
    console.log(`\n✅ VALIDAÇÃO OK: Migrations 0005-0008 NÃO existem no banco.`);
    console.log('   É seguro remover os arquivos SQL órfãos.');
    
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

validateOrphans();
