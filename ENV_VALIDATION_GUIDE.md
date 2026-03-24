# 📋 Environment Variables - Validation Guide

## Overview

Este documento descreve como configurar e validar variáveis de ambiente com segurança de produção.

**Arquivo de validação**: `server/config/env.ts` (Zod schema com fail-fast pattern)

---

## ✅ Validação de Segurança Implementada

### 1. JWT Secrets (Obrigatório)

| Variable | Min Dev | Min Prod | Default | Description |
|----------|---------|----------|---------|-------------|
| `JWT_ACCESS_SECRET` | 32 chars | 64 chars | ❌ Required | Token de acesso (15m) |
| `JWT_REFRESH_SECRET` | 32 chars | 64 chars | ❌ Required | Token de refresh (7d) |
| `APP_SECRET` | 32 chars | 64 chars | ❌ Required | Secret da aplicação |

### 2. Database Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DATABASE_URL` | string | ❌ Required | MySQL connection URL (mysql://user:pass@host:3306/db) |
| `DATABASE_HOST` | string | localhost | Host (ignorado se DATABASE_URL presente) |
| `DATABASE_PORT` | number | 3306 | Port |
| `DATABASE_USER` | string | vendas | User |
| `DATABASE_PASSWORD` | string | - | Password |
| `DATABASE_NAME` | string | vendas_app | Database name |
| `DATABASE_SSL` | boolean | false | Enable SSL |

### 3. Redis Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `REDIS_HOST` | string | localhost | Redis host |
| `REDIS_PORT` | number | 6379 | Redis port |
| `REDIS_PASSWORD` | string (opt) | - | Redis password |
| `REDIS_DB` | number | 0 | Redis database number |

### 4. Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | enum | development | Environment mode |
| `PORT` | number | 3000 | Server port |

---

## 🔐 Production Security Requirements

Em `NODE_ENV=production`, as seguintes regras **são obrigatórias**:

```typescript
// ✅ Valid in production
JWT_ACCESS_SECRET=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890  // 64 chars
JWT_REFRESH_SECRET=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 // 64 chars
APP_SECRET=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890         // 64 chars

// ❌ Will fail in production
JWT_ACCESS_SECRET=shortSecret  // < 64 chars → ERROR
NODE_ENV=production DATABASE_URL="" # Missing → ERROR
```

---

## 🛠️ Setup Guide

### Step 1: Generate Strong Secrets

```bash
# Generate 64-character secret (recommended for production)
openssl rand -base64 32 | head -c 64

# Example output:
# abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB
```

### Step 2: Create .env File

```bash
# Copy template
cp .env.example .env

# Edit .env with proper values
nano .env
```

### Step 3: Configure Required Variables

```env
# Node environment
NODE_ENV=development
PORT=3000

# Database (obrigatório)
DATABASE_URL=mysql://vendas:vendas123@localhost:3306/vendas_app

# JWT Secrets (obrigatório)
JWT_ACCESS_SECRET=your_64_char_secret_here_generated_with_openssl
JWT_REFRESH_SECRET=your_64_char_secret_here_generated_with_openssl
APP_SECRET=your_64_char_secret_here_generated_with_openssl

# Redis (obrigatório)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Config (opcional)
JWT_ISSUER=erp-system
JWT_AUDIENCE=erp-users
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Step 4: Start Application

```bash
pnpm run dev
```

**Expected output** (development):
```
✅ Environment validado com sucesso
📊 Ambiente: development
🔌 Porta: 3000
🗄️ Database: localhost:3306/vendas_app
```

---

## 🎯 Validation Rules by Environment

### Development (NODE_ENV=development)

```
✅ JWT_ACCESS_SECRET:  32+ chars (recommended)
✅ JWT_REFRESH_SECRET: 32+ chars (recommended)
✅ APP_SECRET:         32+ chars (recommended)
✅ DATABASE_URL:       Required
✅ REDIS_HOST:         Required
```

### Production (NODE_ENV=production)

```
✅ JWT_ACCESS_SECRET:  64+ chars (REQUIRED)
✅ JWT_REFRESH_SECRET: 64+ chars (REQUIRED)
✅ APP_SECRET:         64+ chars (REQUIRED)
✅ DATABASE_URL:       Required + SSL recommended
✅ REDIS_HOST:         Required + Password recommended
```

---

## 📦 Usage in Code

### Getting Environment Variables

```typescript
import { env, getEnv, config } from '@/server/config/env';

// Option 1: Direct import (validates at module load)
console.log(env.PORT);          // number
console.log(env.JWT_ACCESS_SECRET); // string

// Option 2: Getter function
const currentEnv = getEnv();
console.log(currentEnv.DATABASE_URL);

// Option 3: Structured access
console.log(config.server.port);
console.log(config.security.jwtAccessSecret);
console.log(config.database.url);
console.log(config.cache.redis.host);
```

### Helper Functions

```typescript
import { 
  env, 
  isProduction,
  isDevelopment,
  getDatabaseUrl,
  getRedisOptions,
  validateJwtSecretStrength
} from '@/server/config/env';

// Check environment
if (isProduction()) {
  // Production-specific logic
}

// Get connection strings
const dbUrl = getDatabaseUrl(env);
const redisOpts = getRedisOptions(env);

// Validate secret strength
const strength = validateJwtSecretStrength(env.JWT_ACCESS_SECRET);
console.log(strength); // { valid: true, strength: 'strong' }
```

---

## 🚨 Error Handling

### Validation Failures Trigger Immediate Exit

```
╔════════════════════════════════════════════════════════════╗
║           ❌ ERRO CRÍTICO: ENVIRONMENT INVÁLIDO             ║
╚════════════════════════════════════════════════════════════╝

📋 VARIÁVEIS INVÁLIDAS OU FALTANDO:

  1. JWT_ACCESS_SECRET
     └─ JWT_ACCESS_SECRET deve ter MÍNIMO 64 caracteres em produção
  
  2. DATABASE_URL
     └─ DATABASE_URL é obrigatório

📖 SOLUÇÃO:
  1. Copie .env.example para .env
  2. Configure todas as variáveis obrigatórias
  3. Reinicie o servidor

🔐 NOTA DE SEGURANÇA:
  Em NODE_ENV=production, JWT secrets devem ter MÍNIMO 64 caracteres
  Use: openssl rand -base64 32 | head -c 64
```

### Fail-Fast Pattern

Environment validation happens **at module load time**:
- ❌ Validation fails → Process exits immediately
- ✅ Validation passes → Application continues

This ensures:
- No runtime surprises
- Clear error messages at startup
- Type safety throughout application

---

## 🔄 Architecture Impact

Validation integrates with LEO architecture:

```
┌─────────────────────────────────────────┐
│        Application Bootstrap            │
├─────────────────────────────────────────┤
│  1. Load server/config/env.ts           │
│     ↓ Validates environment (fail-fast) │
│  2. Initialize dependencies             │
│     ↓ Redis, Database, Logger           │
│  3. Start server (PORT from env)        │
│     ↓ All services ready                │
│  4. Accept requests → LEO pipeline      │
│     TOOLS → SERVICES → DATABASE         │
└─────────────────────────────────────────┘
```

---

## 📄 Template Files

### .env (Development)

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=mysql://vendas:vendas123@localhost:3306/vendas_app
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_ACCESS_SECRET=dev_secret_32_chars_minimum_here_ok
JWT_REFRESH_SECRET=dev_secret_32_chars_minimum_here_ok
APP_SECRET=dev_secret_32_chars_minimum_here_ok
```

### .env.production

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://user:pass@prod-host:3306/vendas_app
REDIS_HOST=prod-redis.example.com
REDIS_PASSWORD=your_redis_password
REDIS_PORT=6379
JWT_ACCESS_SECRET=prod_secret_64_chars_generated_with_openssl_here
JWT_REFRESH_SECRET=prod_secret_64_chars_generated_with_openssl_here
APP_SECRET=prod_secret_64_chars_generated_with_openssl_here
ENABLE_HELMET=true
ENABLE_COMPRESSION=true
TRUST_PROXY=true
```

---

## 🧪 Testing Validation

```bash
# Test validation (will exit if invalid)
pnpm run dev

# Test production environment
NODE_ENV=production pnpm run build

# Check environment variables loaded
node -e "const {env} = require('./dist/server/config/env'); console.log(env.PORT)"
```

---

## 📚 References

- **Zod Documentation**: https://zod.dev
- **12-Factor App**: https://12factor.net (Environment configs)
- **OWASP**: Secret Management Best Practices
- **Node.js Process**: https://nodejs.org/api/process.html

---

**Status**: ✅ Production Ready  
**Last Updated**: 2026-03-23  
**Type Safety**: Full (Zod + TypeScript)  
**Validation Pattern**: Fail-Fast (exit on error)
