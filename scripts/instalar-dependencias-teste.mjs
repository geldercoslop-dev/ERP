/**
 * Script para instalar as dependências necessárias para os testes
 */
import { execSync } from 'child_process';
import fs from 'fs';

console.log('=== INSTALANDO DEPENDÊNCIAS PARA TESTES ===');

// Lista de dependências necessárias
const dependencies = [
  'axios',
  'uuid',
  'mysql2',
  'dotenv'
];

// Verificar se as dependências já estão instaladas
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const installedDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

// Filtrar dependências que precisam ser instaladas
const depsToInstall = dependencies.filter(dep => !installedDeps[dep]);

if (depsToInstall.length === 0) {
  console.log('Todas as dependências já estão instaladas.');
} else {
  console.log(`Instalando dependências: ${depsToInstall.join(', ')}`);
  
  try {
    execSync(`npm install ${depsToInstall.join(' ')}`, { 
      stdio: 'inherit'
    });
    console.log('Dependências instaladas com sucesso!');
  } catch (error) {
    console.error('Erro ao instalar dependências:', error.message);
    process.exit(1);
  }
}

console.log('\n=== INSTALAÇÃO CONCLUÍDA ===');
console.log('Você pode executar os testes com:');
console.log('  node scripts/teste-guerra-erp.mjs');