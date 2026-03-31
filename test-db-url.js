#!/usr/bin/env node

// Script simples que testa DATABASE_URL sem dependências
require('dotenv').config();

console.log('🔥 ===== DATABASE_URL DEBUG =====');
console.log('🔥 process.env.DATABASE_URL:', process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error('🔴 DATABASE_URL NÃO DEFINIDO!');
  process.exit(1);
}

// Parse URL
try {
  const urlString = process.env.DATABASE_URL.trim();
  const u = new URL(urlString);
  
  console.log('\n🔥 ===== PARSED CONFIG =====');
  console.log('🔥 hostname:', u.hostname);
  console.log('🔥 port:', u.port);
  console.log('🔥 database:', u.pathname.replace(/^\//, '').split('/')[0]);
  console.log('🔥 user:', decodeURIComponent(u.username));
  
  // Verificar localhost vs mysql
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
    console.log('\n🔴 PROBLEMA ENCONTRADO: Hostname é localhost');
    console.log('   Esperado: mysql');
    process.exit(1);
  } else if (u.hostname === 'mysql') {
    console.log('\n✅ CORRETO: Hostname é mysql');
  }
  
} catch (err) {
  console.error('🔴 Erro ao fazer parse:', err.message);
  process.exit(1);
}

console.log('\n✅ DATABASE_URL está correto!');
process.exit(0);
