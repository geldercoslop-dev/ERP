#!/usr/bin/env node

/**
 * Script para gerar secrets seguros
 * Gera JWT_SECRET, APP_SECRET e SESSION_SECRET com 64+ caracteres
 */

import crypto from 'crypto';

function generateSecret(name, length = 64) {
  const secret = crypto.randomBytes(length).toString('base64');
  console.log(`${name}=${secret}`);
  return secret;
}

console.log('# Secrets gerados em ' + new Date().toISOString());
console.log('# Copie para seu .env');
console.log('');

generateSecret('JWT_SECRET', 64);
generateSecret('JWT_ACCESS_SECRET', 64);
generateSecret('JWT_REFRESH_SECRET', 64);
generateSecret('APP_SECRET', 64);
generateSecret('SESSION_SECRET', 64);

console.log('');
console.log('# Todos os secrets têm 64+ caracteres para máxima segurança');
console.log('# Validação automática: produção exige 64+ caracteres');
