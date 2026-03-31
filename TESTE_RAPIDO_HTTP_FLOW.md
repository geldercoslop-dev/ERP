# 🚀 GUIA RÁPIDO: Testar o Fluxo HTTP Corrigido

## 📋 O que foi feito

✅ **Backend:** Cookie-parser adicionado, CSRF middleware funcionando  
✅ **Cliente:** Serviço CSRF + headers automáticos  
✅ **Security:** CSRF + session tokens em todas requisições  
✅ **TypeScript:** Ambas compilações passaram (zero errors)  

---

## ⚡ Comando para testar agora

### Terminal 1: Iniciar o servidor
```bash
cd c:\ERP
pnpm dev
```

Aguarde até aparecer: `[BOOT] servidor ouvindo em 0.0.0.0:3000`

### Terminal 2: Rodar teste HTTP
```bash
cd c:\ERP
node test-http-flow.mjs
```

**Saída esperada:**
```
🚀 Starting HTTP Flow Tests

1️⃣  GET /api/csrf-token
   Status: 200
   CSRF Token: 7a3f2c8e1d6b9a54...
   
2️⃣  POST /api/trpc/auth.login
   Status: 200
   Session Token: 3h7k2m9n8p4w1b6c...
   Login OK: true
   
3️⃣  POST /api/trpc/auth.me (protected query)
   Status: 200
   ✅ Protected endpoint works!

✅ All tests completed!

📊 Summary:
   CSRF Token obtained: true
   Login successful: true
   Session token obtained: true
   Protected endpoint accessible: true
```

---

## 🔍 Verificação Manual (sem script)

Se preferir testar manualmente via Postman/curl:

### 1. Obter CSRF Token
```bash
curl -v http://localhost:3000/api/csrf-token
```
Salve o `csrfToken` da resposta e o cookie `csrf-token`

### 2. Login
```bash
curl -v \
  -H "x-csrf-token: {TOK_AQUI}" \
  -H "Cookie: csrf-token={TOK_AQUI}" \
  -d '{"username":"admin","password":"admin"}' \
  http://localhost:3000/api/trpc/auth.login
```

Salve o `sessionToken` da resposta

### 3. Testar endpoint protegido
```bash
curl -v \
  -H "x-csrf-token: {TOK_AQUI}" \
  -H "x-session-token: {SESSION_TOK_AQUI}" \
  http://localhost:3000/api/trpc/auth.me
```

---

## 🐛 Troubleshooting

| Erro | Causa | Solução |
|---|---|---|
| `401 UNAUTHORIZED` | x-app-secret inválido | Verificar VITE_APP_SECRET em .env.development |
| `403 CSRF token validation failed` | CSRF token não enviado | Verificar cookie `csrf-token` e header `x-csrf-token` |
| `ECONNREFUSED` | Server não está rodando | Verificar se pnpm dev está executando |
| `Cookie missing` | NODE_ENV não está certo | Verificar NODE_ENV (deve ser development para dev) |

---

## ✅ Checklist de Validação

- [ ] TypeScript compila sem erros
- [ ] Servidor inicia em `localhost:3000`
- [ ] GET /api/csrf-token retorna 200 com token
- [ ] POST /api/trpc/auth.login retorna 200 com sessionToken
- [ ] POST /api/trpc/auth.me retorna 200 (autenticado)
- [ ] Headers incluem x-csrf-token e x-app-secret
- [ ] Cookies sendo transmitidos corretamente

---

## 📚 Documentação Completa

Ver: `MISSAO_CORRECAO_HTTP_FLOW_COMPLETA.md`

Contém:
- Todos os problemas identificados
- Cada mudança de código explicada
- Fluxo antes/depois
- Notas de segurança
- Próximos passos
