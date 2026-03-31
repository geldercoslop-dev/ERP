# 🚀 GUIA RÁPIDO: Redis Rate Limiting

## ✅ O Que Foi Feito

- ✅ **rateLimitService.ts**: Map em memória → Redis INCR+EXPIRE
- ✅ **JobRateLimiter**: Array em memória → Redis Sorted Sets
- ✅ **Routers**: Atualizado para async/await
- ✅ **TypeScript**: Compilação sem erros
- ✅ **Script de Teste**: Pronto para validação

---

## ⚡ Commands para Testar Agora

### Terminal 1: Start Server
```bash
cd c:\ERP
pnpm dev
```

Wait for: `[BOOT] servidor ouvindo em 0.0.0.0:3000`

### Terminal 2: Run Rate Limiting Tests
```bash
cd c:\ERP
node test-redis-rate-limit.mjs
```

**Expected Output:**
```
🚀 Redis-Backed Rate Limiting Tests

TEST 1: Login Rate Limiting (5 attempts/min)
  Attempt 1-5: ❌ Status 401 (allowed)
  Attempt 6-8: 🚫 Status 429 (RATE LIMITED!)
  Result: ✅ PASS

TEST 2: Redis Key Storage
  ✅ Connected to Redis
  Rate limit keys: 1
  Result: ✅ PASS

TEST 3: Health Endpoint
  All 10 requests: ✅ Status 200
  Result: ✅ PASS

📊 Summary: 3/3 tests passed
🎉 All tests passed! Redis rate limiting is working correctly.
```

---

## 🔍 Manual Verification

### Check Redis Keys

```bash
# Terminal 3: Connect to Redis
redis-cli

# Inside redis-cli, list all rate limit keys
> KEYS "ratelimit:*"
> KEYS "job:ratelimit:*"

# To see actual values
> GET ratelimit:service:127.0.0.1:admin
> TTL ratelimit:service:127.0.0.1:admin  # Should show remaining seconds
```

### Make Login Attempts (Manual)

```bash
# Attempt 1-5: Should get 401 (unauthorized - wrong password)
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/trpc/auth.login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n"
  sleep 0.5
done

# Attempt 6+: Should get 429 (Too Many Requests)
curl -X POST http://localhost:3000/api/trpc/auth.login \
  -d '{"username":"admin","password":"wrong"}' \
  -w "\nStatus: %{http_code}\n"
# Expected: 429 Too Many Requests
```

### Health Check (Never Rate Limited)

```bash
# Make 20 rapid requests - should ALL return 200
for i in {1..20}; do
  curl -s http://localhost:3000/api/health -w "%{http_code}\n" | head -1
done
# All should be 200
```

---

## 📊 How It Works

### Before (Memory - ❌ BROKEN)
```
Request 1: Map.set("127.0.0.1:admin", 1)
Request 2-5: Increment counter
Request 6+: Block

Server restart → Map clears → Counter resets ❌
Multiple instances → Each has own Map → No sync ❌
```

### After (Redis - ✅ WORKING)
```
Request 1: INCR ratelimit:service:127.0.0.1:admin
Request 2-5: Increment counter
Request 6+: Block

Server restart → Redis persists ✅
Multiple instances → All share Redis ✅
```

---

## 🔐 Protected Endpoints

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/trpc/auth.login` | 5 | 60s |
| `/api/trpc/auth.*` | 10 | 15min |
| `/api/trpc/admin.*` | 30 | 1min |
| `job:pedido_create` | 30 | 1min |
| `job:estoque_update` | 60 | 1min |

---

## ✅ Validation Checklist

- [ ] Server starts without errors
- [ ] Redis connects successfully
- [ ] Login rate limiting blocks after 5 attempts
- [ ] Status returns 429 when rate limited
- [ ] Rate limit resets after 60 seconds
- [ ] Health endpoint not rate limited
- [ ] Redis keys persist after server restart

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Redis connection error | Check REDIS_HOST/REDIS_PORT in .env |
| Tests timeout | Make sure server is running on port 3000 |
| Rate limit not working | Check Redis connection: `redis-cli PING` |
| Wrong test results | Clear Redis: `redis-cli FLUSHDB` and retry |

---

## 📚 Full Documentation

See: `REDIS_RATE_LIMITING_IMPLEMENTATION.md`
