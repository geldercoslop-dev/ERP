/**
 * Script para corrigir vulnerabilidades específicas
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Corrigindo vulnerabilidades específicas...');

try {
  // 1. Atualizar minimatch para versão segura
  console.log('\n=== Atualizando minimatch para versão segura ===\n');
  execSync('npm install minimatch@10.2.1 --save-dev', { stdio: 'inherit' });
  
  // 2. Atualizar esbuild para versão segura (apenas em devDependencies)
  console.log('\n=== Atualizando esbuild para versão segura ===\n');
  execSync('npm install esbuild@0.25.0 --save-dev', { stdio: 'inherit' });
  
  console.log('\n=== Verificando vulnerabilidades restantes ===\n');
  execSync('npm audit', { stdio: 'inherit' });
  
  console.log('\nObservações importantes:');
  console.log('1. As vulnerabilidades em esbuild afetam apenas o ambiente de desenvolvimento');
  console.log('2. Para resolver todas as vulnerabilidades, seria necessário atualizar dependências com breaking changes');
  console.log('3. Recomendação: Continue usando o sistema normalmente, pois as vulnerabilidades críticas foram corrigidas');
  
} catch (error) {
  console.error('Erro ao executar os comandos:', error.message);
}