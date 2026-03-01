/**
 * Script para verificar e corrigir vulnerabilidades de segurança
 * 
 * Este script executa npm audit fix para corrigir vulnerabilidades de segurança
 * e depois verifica se ainda existem vulnerabilidades que precisam ser resolvidas.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Verificando e corrigindo vulnerabilidades de segurança...');

try {
  // Executar npm audit fix
  console.log('\n=== Executando npm audit fix ===\n');
  execSync('npm audit fix', { stdio: 'inherit' });
  
  console.log('\n=== Verificando vulnerabilidades restantes ===\n');
  
  // Verificar vulnerabilidades restantes
  const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
  
  try {
    const auditData = JSON.parse(auditOutput);
    
    if (auditData.vulnerabilities && Object.keys(auditData.vulnerabilities).length > 0) {
      console.log('\nVulnerabilidades restantes:');
      
      // Listar vulnerabilidades por pacote
      for (const [pkg, vuln] of Object.entries(auditData.vulnerabilities)) {
        console.log(`\n${pkg}:`);
        console.log(`  Severidade: ${vuln.severity}`);
        console.log(`  Via: ${vuln.via.join(', ')}`);
        if (vuln.fixAvailable) {
          console.log(`  Correção disponível: ${typeof vuln.fixAvailable === 'object' ? vuln.fixAvailable.name : 'Sim'}`);
        } else {
          console.log('  Correção disponível: Não');
        }
      }
      
      console.log('\nSugestões para correção manual:');
      console.log('1. Atualize as dependências diretas para versões mais recentes');
      console.log('2. Para dependências indiretas, verifique se há atualizações disponíveis para as dependências diretas que as utilizam');
      console.log('3. Para vulnerabilidades sem correção disponível, considere alternativas para os pacotes afetados');
    } else {
      console.log('\nNenhuma vulnerabilidade encontrada após as correções!');
    }
  } catch (parseError) {
    console.log('Não foi possível analisar o resultado do npm audit. Verifique manualmente com npm audit.');
  }
} catch (error) {
  console.error('Erro ao executar os comandos:', error.message);
}