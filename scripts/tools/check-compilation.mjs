/**
 * Script para verificar se o sistema pode ser compilado sem erros
 */

import { execSync } from 'child_process';

console.log('Verificando se o sistema pode ser compilado sem erros...');

try {
  // Verificar se o TypeScript compila sem erros
  console.log('\n=== Verificando compilação do TypeScript ===\n');
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  
  console.log('\n✅ Compilação do TypeScript concluída sem erros!');
  
  // Verificar se o Vite pode construir o cliente
  console.log('\n=== Verificando compilação do cliente com Vite ===\n');
  execSync('npx vite build --mode development', { stdio: 'inherit' });
  
  console.log('\n✅ Compilação do cliente concluída sem erros!');
  
  console.log('\nO sistema parece estar pronto para ser iniciado sem erros de compilação.');
  console.log('Execute o comando "npm run dev" para iniciar o sistema.');
  
} catch (error) {
  console.error('\n❌ Erro durante a verificação de compilação:', error.message);
  console.log('\nDetalhes do erro:');
  console.log(error.stdout?.toString() || 'Nenhum detalhe disponível');
}