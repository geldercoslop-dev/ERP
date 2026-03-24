#!/usr/bin/env node

/**
 * Build & Deployment Validation Script
 * 
 * Validates:
 * - TypeScript compilation
 * - dist/server/ outputs
 * - Environment configuration
 * - Production readiness
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = process.cwd();
const DIST_SERVER = path.join(PROJECT_ROOT, 'dist', 'server');

// ============================================================================
// CHECKS
// ============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const checks: CheckResult[] = [];

function check(name: string, condition: boolean, message: string) {
  checks.push({ name, passed: condition, message });
  const symbol = condition ? '✅' : '❌';
  console.log(`${symbol} ${name}: ${message}`);
}

// Check 1: TypeScript compilation
console.log('\n📋 Checking TypeScript Compilation...\n');

try {
  execSync('pnpm exec tsc -p tsconfig.server.json --noEmit', {
    stdio: 'pipe',
    cwd: PROJECT_ROOT,
  });
  check('TypeScript Compilation', true, 'No type errors');
} catch (error) {
  check('TypeScript Compilation', false, 'Has type errors');
}

// Check 2: dist/server exists
console.log('\n📋 Checking Build Output...\n');

const distServerExists = fs.existsSync(DIST_SERVER);
check('dist/server/ Directory', distServerExists, distServerExists ? 'Created' : 'Missing');

// Check 3: dist/server/index.js exists
if (distServerExists) {
  const indexJsExists = fs.existsSync(path.join(DIST_SERVER, 'index.js'));
  check('dist/server/index.js', indexJsExists, indexJsExists ? 'Generated' : 'Missing');

  // Check 4: index.js is valid JavaScript (not TypeScript source)
  if (indexJsExists) {
    const content = fs.readFileSync(path.join(DIST_SERVER, 'index.js'), 'utf-8');
    const hasTypeScript = content.includes(': void') || content.includes('interface') || content.includes('type ');
    const hasImportTs = content.includes('.ts');
    
    check('JavaScript Output', !hasTypeScript, hasTypeScript ? 'Contains TypeScript' : 'Valid JavaScript');
    check('No .ts imports', !hasImportTs, hasImportTs ? 'Has .ts import paths' : 'Paths correct');
  }
} else {
  console.log('⏭️  Skipping checks for dist/server/* (directory doesn\'t exist)\n');
}

// Check 5: package.json scripts
console.log('\n📋 Checking Scripts Configuration...\n');

try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8')
  );
  
  const scripts = packageJson.scripts || {};
  check('build script', !!scripts.build, scripts.build || 'Missing');
  check('start script', !!scripts.start, scripts.start || 'Missing');
  check('dev script', !!scripts.dev, scripts.dev || 'Missing');
} catch (error) {
  check('package.json', false, 'Cannot read');
}

// Check 6: tsconfig.server.json
console.log('\n📋 Checking TypeScript Configuration...\n');

try {
  const tsconfigServer = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'tsconfig.server.json'), 'utf-8')
  );
  
  const outDir = tsconfigServer.compilerOptions?.outDir;
  const rootDir = tsconfigServer.compilerOptions?.rootDir;
  
  check('outDir set to "dist"', outDir === 'dist', outDir || 'Not set');
  check('rootDir configured', !!rootDir, rootDir || 'Not set');
} catch (error) {
  check('tsconfig.server.json', false, 'Cannot read');
}

// Check 7: Environment variables
console.log('\n📋 Checking Environment Configuration...\n');

try {
  const envPath = path.join(PROJECT_ROOT, '.env.production');
  const envExists = fs.existsSync(envPath);
  check('.env.production exists', envExists, envExists ? 'Created' : 'Missing (optional for dev)');
  
  if (envExists) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    
    const hasNodeEnv = envContent.includes('NODE_ENV');
    const hasDatabaseUrl = envContent.includes('DATABASE_URL');
    const hasJwtAccess = envContent.includes('JWT_ACCESS_SECRET');
    const hasJwtRefresh = envContent.includes('JWT_REFRESH_SECRET');
    const hasAppSecret = envContent.includes('APP_SECRET');
    const hasRedisHost = envContent.includes('REDIS_HOST');
    
    check('NODE_ENV configured', hasNodeEnv, hasNodeEnv ? 'Set' : 'Missing');
    check('DATABASE_URL configured', hasDatabaseUrl, hasDatabaseUrl ? 'Set' : 'Missing');
    check('JWT_ACCESS_SECRET configured', hasJwtAccess, hasJwtAccess ? 'Set' : 'Missing');
    check('JWT_REFRESH_SECRET configured', hasJwtRefresh, hasJwtRefresh ? 'Set' : 'Missing');
    check('APP_SECRET configured', hasAppSecret, hasAppSecret ? 'Set' : 'Missing');
    check('REDIS_HOST configured', hasRedisHost, hasRedisHost ? 'Set' : 'Missing');
  }
} catch (error) {
  console.log('⚠️  Could not check .env.production\n');
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    VALIDATION SUMMARY                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const passed = checks.filter(c => c.passed).length;
const total = checks.length;
const percentage = Math.round((passed / total) * 100);

console.log(`Results: ${passed}/${total} checks passed (${percentage}%)\n`);

if (percentage === 100) {
  console.log('✅ All checks passed - System is production ready!\n');
  console.log('Next steps:');
  console.log('  1. pnpm run build              → Compile TypeScript');
  console.log('  2. NODE_ENV=production pnpm run start  → Start production server');
  console.log('  3. curl http://localhost:3000/api/health → Verify health');
  process.exit(0);
} else {
  console.log('⚠️  Some checks failed - Please review above\n');
  console.log('Failed checks:');
  checks.filter(c => !c.passed).forEach(c => {
    console.log(`  - ${c.name}: ${c.message}`);
  });
  process.exit(1);
}
