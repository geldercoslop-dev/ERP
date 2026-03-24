#!/usr/bin/env node
/**
 * Script para testar boot do servidor
 * Roda npm run dev por 15 segundos e captura output
 */
import { spawn } from 'child_process';

console.log('🚀 Iniciando servidor...\n');

const server = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  stdio: 'inherit',  // Herdar stdio dos pais
  shell: true,
});

let timeout;

server.on('close', (code) => {
  clearTimeout(timeout);
  console.log(`\nServidor encerrou com código: ${code}`);
  process.exit(code || 0);
});

server.on('error', (err) => {
  clearTimeout(timeout);
  console.error(`\n❌ Erro ao iniciar servidor:`, err);
  process.exit(1);
});

// Parar após 15 segundos
timeout = setTimeout(() => {
  console.log('\n✅ Tempo limite atingido (15s) - servidor está rodando!');
  server.kill();
  process.exit(0);
}, 15000);
