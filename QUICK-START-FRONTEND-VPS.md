# 🚀 QUICK START - Frontend + Backend VPS (3 passos)

---

## 📋 ANTES DE COMEÇAR

Você precisa dos seguintes dados da VPS:

```
IP da VPS:     192.168.x.x   ou   seu-dominio.com
Porta (padrão): 3000
Usuário teste:  seu@email.com
Senha teste:    sua-senha
```

---

## PASSO 1️⃣ - EDITAR CONFIGURAÇÃO

**Arquivo**: `c:\ERP\vite.config.ts`  
**Linha**: ~50 (procure por `"/api"`)

### Encontre:
```typescript
proxy: {
  "/api": {
    target: "http://localhost:3000",  // ← AQUI
    changeOrigin: true,
    secure: false,
  },
}
```

### Substitua por:
```typescript
proxy: {
  "/api": {
    target: "http://192.168.1.100:3000",  // ← SEU IP:PORTA
    changeOrigin: true,
    secure: false,
  },
}
```

**Salve o arquivo** (Ctrl+S)

---

## PASSO 2️⃣ - INICIAR FRONTEND

### Opção A: PowerShell (Fácil)
```powershell
cd C:\ERP
. .\start-vps-frontend.ps1
```

### Opção B: CMD (Rápido)
```cmd
cd C:\ERP\client
npm run dev
```

**Esperado**: Vite inicia na porta 5173
```
  ➜  Local:   http://localhost:5173
  ➜  Press h to show help
```

---

## PASSO 3️⃣ - TESTAR NO NAVEGADOR

### 🌐 Abra: http://localhost:5173

#### Testes rápidos:

**A. Página carrega?**
```
✅ SIM → OK
❌ NÃO → Vite não está rodando ou erro timeout
```

**B. Health check (console F12)**
```javascript
fetch('/api/health').then(r=>r.json()).then(d=>console.log(d))
// Esperado: resposta JSON do backend
```

**C. Login (se houver)**
- Ir para `/login`
- Inserir credenciais REAIS
- Esperado: redireciona para dashboard

**D. Chat LEO (se houver)**
- Navegar até chat
- Enviar mensagem
- Esperado: resposta da IA

---

## ✅ SUCESSO SE:

- [ ] Frontend carrega em http://localhost:5173
- [ ] Sem erros vermelho no console (F12)
- [ ] Login funciona com credenciais reais
- [ ] Requisições `/api/*` retornam dados
- [ ] Chat responde sem erro 5xx

---

## ⚠️ SE ALGO DER ERRADO:

| Erro | Causa | Solução |
|------|-------|---------|
| `Cannot GET /` | Vite não rodando | Execute `npm run dev` |
| `ECONNREFUSED` | IP VPS incorreto | Verifique `vite.config.ts` |
| `CORS error` | Proxy não ativo | Rode `npm run dev` (não `dev:server`) |
| `Port 5173 in use` | Porta ocupada | Execute: `npm run dev -- --port 5174` |
| Login falha | Credenciais inválidas | Teste credenciais no backend direto |

---

## 📊 GERAR RELATÓRIO FINAL

Quando tudo passou:

```powershell
node generate-vps-report.mjs
```

Relatório será gerado com:
- ✅ Todas as fases testadas
- ✅ Validações realizadas
- ✅ Estatísticas
- ✅ JSON de saída

---

## 🎯 RESULTADO ESPERADO

```
FASE 1: Frontend Vite → ✅ OK
FASE 2: Conexão Backend → ✅ OK
FASE 3: Login Real → ✅ OK
FASE 4: CORS → ✅ OK
FASE 5: Chat LEO → ✅ OK

Taxa de sucesso: 100%
Tempo total: ~5 segundos
```

---

## 📞 DÚVIDAS?

Verifique estes documentos completos:

1. **SETUP-FRONTEND-PRODUCTION.md** - Guia detalhado com todos os passos
2. **VPS-SETUP-CHECKLIST.md** - Checklist completo com troubleshooting
3. **validate-frontend-vps.mjs** - Script automático de validação

---

**Última atualização**: 24 de março de 2026  
**Tempo estimado**: 5-10 minutos para completar tudo
