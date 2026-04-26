/**
 * Gerar secrets válidos para .env
 * Gera strings aleatórias de 128+ caracteres
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '.env');

// Função para gerar string aleatória de 128 caracteres
function generateSecret() {
  return crypto.randomBytes(64).toString('hex'); // 128 chars hex
}

// Carregar .env existente
const envConfig = dotenv.config({ path: envPath });
const envVars = envConfig.parsed || {};

// Gerar novos secrets
const newSecrets = {
  APP_SECRET: generateSecret(),
  JWT_SECRET: generateSecret(),
  JWT_ACCESS_SECRET: generateSecret(),
  JWT_REFRESH_SECRET: generateSecret(),
  DATABASE_URL: envVars.DATABASE_URL || 'mysql://root:password@localhost:3306/erp_dev',
  MYSQL_ROOT_PASSWORD: envVars.MYSQL_ROOT_PASSWORD || 'password',
  MYSQL_DATABASE: envVars.MYSQL_DATABASE || 'erp_dev',
  MYSQL_USER: envVars.MYSQL_USER || 'root',
  MYSQL_PASSWORD: envVars.MYSQL_PASSWORD || 'password'
};

// Atualizar env vars
Object.assign(envVars, newSecrets);

// Escrever de volta no .env
const envContent = Object.entries(envVars)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

fs.writeFileSync(envPath, envContent);

console.log('✅ Secrets gerados e atualizados no .env:');
Object.entries(newSecrets).forEach(([key, value]) => {
  console.log(`  ${key}: ${value.substring(0, 20)}... (${value.length} chars)`);
});
