/**
 * Script de verificação de infraestrutura
 * 
 * Valida:
 * - ✅ Variáveis de ambiente obrigatórias
 * - ✅ NODE_ENV em produção
 * 
 * Exit code: 0 (sucesso) ou 1 (falha)
 */

import '../_core/loadEnv';
import { getEnv } from '../config/env';

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  VERIFICAÇÃO DE INFRAESTRUTURA         ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // 1. Environment validation
    console.log('✅ Validando variáveis de ambiente...');
    const env = getEnv();
    
    console.log(`   • NODE_ENV: ${env.NODE_ENV}`);
    console.log(`   • PORT: ${env.PORT}`);
    console.log(`   • DATABASE_URL: ${env.DATABASE_URL ? '✓ configurado' : '✗ ausente'}`);
    console.log(`   • REDIS_HOST: ${env.REDIS_HOST}`);
    console.log(`   • APP_SECRET: ${env.APP_SECRET ? '✓ configurado' : '✗ ausente'}`);
    console.log(`   • JWT_ACCESS_SECRET: ${env.JWT_ACCESS_SECRET ? '✓ configurado' : '✗ ausente'}`);
    console.log(`   • JWT_REFRESH_SECRET: ${env.JWT_REFRESH_SECRET ? '✓ configurado' : '✗ ausente'}`);

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  ✅ INFRAESTRUTURA VALIDADA            ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log('📋 Variáveis obrigatórias: OK');
    console.log(`🌍 Ambiente: ${env.NODE_ENV.toUpperCase()}`);
    console.log('🚀 Sistema pronto para iniciar!\n');
    
    process.exit(0);

  } catch (error) {
    console.error('\n╔════════════════════════════════════════╗');
    console.error('║  ❌ FALHA NA VALIDAÇÃO                 ║');
    console.error('╚════════════════════════════════════════╝\n');
    
    if (error instanceof Error) {
      console.error(`❌ ${error.message}`);
      console.error('\n📋 Detalhes:');
      console.error(error.stack?.split('\n').slice(0, 5).join('\n'));
    } else {
      console.error('Erro desconhecido:', error);
    }

    console.error('\n🔧 AÇÕES RECOMENDADAS:');
    console.error('1. Copie .env.example para .env');
    console.error('2. Configure todas as variáveis obrigatórias:');
    console.error('   - APP_SECRET (mínimo 8 caracteres)');
    console.error('   - DATABASE_URL (mysql://user:pass@host/db)');
    console.error('   - JWT_ACCESS_SECRET (mínimo 32 caracteres)');
    console.error('   - JWT_REFRESH_SECRET (mínimo 32 caracteres)');
    console.error('   - REDIS_HOST (default: localhost)');
    console.error('3. Reinicie o servidor\n');

    process.exit(1);
  }
}

main().catch(error => {
  console.error('ERRO CRÍTICO:', error);
  process.exit(1);
});
