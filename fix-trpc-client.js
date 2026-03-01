/**
 * Script para corrigir o problema de sintaxe no arquivo trpcClient.ts
 * 
 * Este script verifica se há uma chave de fechamento extra na linha 126 do arquivo
 * e a remove se encontrada.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client', 'src', 'lib', 'trpcClient.ts');

try {
  // Ler o conteúdo do arquivo
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Verificar se há uma chave de fechamento extra no final
  if (content.endsWith('};};')) {
    console.log('Encontrada chave de fechamento extra. Corrigindo...');
    
    // Substituir a chave de fechamento extra por uma única chave
    content = content.replace('};};', '};');
    
    // Salvar o arquivo corrigido
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log('Arquivo corrigido com sucesso!');
  } else if (content.match(/\}\s*;\s*\}\s*;?\s*$/)) {
    console.log('Encontrado padrão de chaves de fechamento incorreto. Corrigindo...');
    
    // Corrigir o padrão de chaves de fechamento
    content = content.replace(/\}\s*;\s*\}\s*;?\s*$/, '};');
    
    // Salvar o arquivo corrigido
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log('Arquivo corrigido com sucesso!');
  } else {
    console.log('Nenhum problema encontrado no arquivo.');
  }
} catch (error) {
  console.error('Erro ao processar o arquivo:', error);
}