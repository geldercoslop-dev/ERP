# 🚀 Environment Setup Checklist

Use this checklist para configurar environment variáveis em novo desenvolvimento.

## Development Setup (Local)

### ✅ Step 1: Clone Configuration

```bash
cd /path/to/ERP
cp .env.example .env
```

### ✅ Step 2: Configure Database

```env
# .env
DATABASE_URL=mysql://vendas:vendas123@localhost:3306/vendas_app
```

**Verify connection**:
```bash
mysql -u vendas -p vendas123 -h localhost vendas_app -e "SELECT 1;"
```

### ✅ Step 3: Configure Redis

```env
# .env
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=  # Leave empty if no password
```

**Verify connection**:
```bash
redis-cli ping
# Expected: PONG
```

### ✅ Step 4: Generate JWT Secrets (Development)

For development, you can use shorter secrets (32+ chars), but **longer is better**:

```bash
# Option 1: Generate 64-char secret (recommended even for dev)
openssl rand -base64 32 | head -c 64
# Output: abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB

# Option 2: Quick dev secrets (copy-paste into .env)
JWT_ACCESS_SECRET=dev_jwt_access_secret_32_chars_minimum_ok
JWT_REFRESH_SECRET=dev_jwt_refresh_secret_32_chars_minimum_ok
APP_SECRET=dev_app_secret_32_chars_minimum_ok
```

Add to `.env`:
```env
JWT_ACCESS_SECRET=your_generated_secret_here
JWT_REFRESH_SECRET=your_generated_secret_here
APP_SECRET=your_generated_secret_here
```

### ✅ Step 5: Start Application

```bash
pnpm run dev
```

Expected output:
```
✅ Environment validado com sucesso
📊 Ambiente: development
🔌 Porta: 3000
🗄️ Database: localhost:3306/vendas_app
```

### ✅ Step 6: Test Health Check

```bash
curl http://localhost:3000/api/health
# Expected: { "status": "ok", "db": "connected", "redis": "connected" }
```

---

## Production Setup (Server)

### ⚠️ CRITICAL: Security Requirements

```bash
# Step 1: Generate STRONG secrets (64+ chars)
openssl rand -base64 32 | head -c 64
# Repeat 3 times for: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, APP_SECRET

# Step 2: Create .env.production
cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3000

# Database (use managed service URL)
DATABASE_URL=mysql://prod_user:secure_password@rds-prod.amazonaws.com:3306/vendas_app
DATABASE_SSL=true

# Redis (use managed service URL/host)
REDIS_HOST=redis-prod.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password

# JWT Secrets (MUST be 64+ chars)
JWT_ACCESS_SECRET=prod_secret_64_chars_minimum_generated_with_openssl
JWT_REFRESH_SECRET=prod_secret_64_chars_minimum_generated_with_openssl
APP_SECRET=prod_secret_64_chars_minimum_generated_with_openssl

# Security flags
ENABLE_HELMET=true
ENABLE_COMPRESSION=true
TRUST_PROXY=true
EOF

# Step 3: Set restrictive permissions
chmod 600 .env.production
chown app:app .env.production

# Step 4: Verify before deployment
NODE_ENV=production pnpm build
NODE_ENV=production pnpm run dev --check-env-only  # if exists
```

### ⚠️ CRITICAL: JWT Secret Strength Check

```bash
# Verify all secrets are 64+ chars
while IFS='=' read -r key value; do
  if [[ "$key" == JWT* ]] || [[ "$key" == APP_SECRET ]]; then
    len=${#value}
    if [ $len -ge 64 ]; then
      echo "✅ $key: $len chars (OK)"
    else
      echo "❌ $key: $len chars (MUST be 64+)"
    fi
  fi
done < .env.production
```

### ⚠️ Deployment Checklist

- [ ] All JWT secrets are 64+ characters
- [ ] DATABASE_URL uses SSL (DATABASE_SSL=true)
- [ ] REDIS_PASSWORD is set (if Redis requires auth)
- [ ] REDIS_HOST is accessible from production servers
- [ ] PORT is exposed correctly in firewall
- [ ] NODE_ENV=production
- [ ] .env.production has restricted permissions (600)
- [ ] Backup .env.production in secure location (AWS Secrets Manager, Vault, etc.)
- [ ] Test with `pnpm run dev` before deploying

---

## Troubleshooting

### Error: "JWT_ACCESS_SECRET must be at least 64 chars in production"

**Solution**: Generate a new secret with openssl:
```bash
openssl rand -base64 32 | head -c 64
```
Then update `.env.production` with the generated value.

### Error: "DATABASE_URL is required"

**Solution**: Check `.env` or `.env.production`:
```bash
grep DATABASE_URL .env
# If empty or missing, configure:
DATABASE_URL=mysql://user:password@host:3306/database
```

### Error: "REDIS_HOST is required"

**Solution**: Add Redis configuration:
```bash
echo "REDIS_HOST=localhost" >> .env
echo "REDIS_PORT=6379" >> .env
```

### Server won't start

**Full validation check**:
```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
# If OK, then:
pnpm exec node -e "const {env} = require('./dist/server/config/env'); console.log('✅ Environment loaded:', env.DATABASE_URL ? 'DB OK' : 'DB MISSING')"
```

---

## Helper Scripts

### Generate All Secrets

```bash
#!/bin/bash
# save as: scripts/gen-secrets.sh

echo "🔐 Generating production secrets..."
echo ""
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 32 | head -c 64)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32 | head -c 64)"
echo "APP_SECRET=$(openssl rand -base64 32 | head -c 64)"
echo ""
echo "✅ Copy above to .env.production"
```

### Validate Environment

```bash
#!/bin/bash
# save as: scripts/validate-env.sh

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is empty"
  exit 1
fi

if [ -z "$REDIS_HOST" ]; then
  echo "❌ REDIS_HOST is empty"
  exit 1
fi

SECRET_LEN=${#JWT_ACCESS_SECRET}
if [ $SECRET_LEN -lt 64 ] && [ "$NODE_ENV" = "production" ]; then
  echo "❌ JWT_ACCESS_SECRET is $SECRET_LEN chars (need 64+ in production)"
  exit 1
fi

echo "✅ Environment validation passed"
```

---

## References

| Topic | Link |
|-------|------|
| Zod Validation | https://zod.dev |
| 12-Factor App | https://12factor.net/config |
| Node.js process.env | https://nodejs.org/api/process.html |
| OWASP Secrets | https://owasp.org/www-community/Sensitive_Data_Exposure |
| MySQL URL Format | https://dev.mysql.com/doc/connector-nodejs/en/connector-nodejs-reference.html |

---

**Status**: ✅ Production Ready  
**Type**: Checklist + Troubleshooting  
**Audience**: Developers, DevOps, SREs
