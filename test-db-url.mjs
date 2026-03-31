#!/usr/bin/env node

// Script simples que testa DATABASE_URL sem dependências (ES module)
import dotenv from 'dotenv';
dotenv.config();

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
  console.log('🔥 port:', u.port || '3306');
  const dbname = u.pathname.replace(/^\//, '').split('/')[0];
  console.log('🔥 database:', dbname);
  console.log('🔥 user:', decodeURIComponent(u.username));
  
  // Verificar localhost vs serviço compose
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
    console.log('\n🔴 ⚠️ PROBLEMA DETECTADO: Hostname é localhost');
    console.log('   Na rede Docker deste repo, esperado: vendas-mysql');
    process.exit(1);
  } else if (u.hostname === 'mysql') {
    console.log('\n🔴 Host "mysql" é legado; use vendas-mysql (ver .env.example)');
    process.exit(1);
  } else if (u.hostname === 'vendas-mysql') {
    console.log('\n✅ CORRETO! Hostname é vendas-mysql (Docker network)');
  } else {
    console.log('\n⚠️ Hostname (verifique se bate com o serviço no seu compose):', u.hostname);
  }
  
} catch (err) {
  console.error('🔴 Erro ao fazer parse:', err.message);
  process.exit(1);
}

console.log('\n✅ DATABASE_URL está CORRETO!');
process.exit(0);
