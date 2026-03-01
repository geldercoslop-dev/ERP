/**
 * Script para verificar se o arquivo trpcClient.ts está sintaticamente correto
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'client', 'src', 'lib', 'trpcClient.ts');

try {
  // Ler o conteúdo do arquivo
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Verificar se a estrutura do objeto está correta
  console.log('Verificando a estrutura do objeto trpcClientConfig...');
  
  // Verificar se há indentação incorreta
  const indentationPattern = /^\s{6}queryClientConfig:/m;
  if (indentationPattern.test(content)) {
    console.error('❌ Erro: Indentação incorreta na propriedade queryClientConfig');
    console.log('A propriedade queryClientConfig deve estar indentada com 2 espaços, não 6.');
    process.exit(1);
  }
  
  // Verificar se há chaves extras
  const closingBracePattern = /\}\s*;\s*\}\s*;?\s*$/;
  if (closingBracePattern.test(content)) {
    console.error('❌ Erro: Chave de fechamento extra no final do arquivo');
    console.log('O arquivo deve terminar com apenas uma chave de fechamento e um ponto-e-vírgula.');
    process.exit(1);
  }
  
  console.log('✅ O arquivo trpcClient.ts parece estar sintaticamente correto!');
  
  // Tentar analisar o arquivo como JavaScript
  console.log('\nTentando analisar o arquivo como JavaScript...');
  
  // Substituir TypeScript por JavaScript para poder avaliar
  const jsContent = content
    .replace(/import .+ from .+;/g, '')
    .replace(/export .+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/: [a-zA-Z<>[\]|]+/g, '')
    .replace(/\?/g, '');
  
  // Verificar se o JavaScript é válido
  try {
    // Usar eval para verificar a sintaxe (apenas para verificação)
    new Function(jsContent);
    console.log('✅ O arquivo pode ser analisado como JavaScript válido!');
  } catch (evalError) {
    console.error('❌ Erro ao analisar o arquivo como JavaScript:', evalError.message);
    console.log('Linha aproximada do erro:', evalError.lineNumber);
  }
  
} catch (error) {
  console.error('Erro ao processar o arquivo:', error);
}