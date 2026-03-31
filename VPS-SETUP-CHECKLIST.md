# 🎯 CHECKLIST DE CONFIGURAÇÃO - FRONTEND + BACKEND REAL

**Versão**: 1.0  
**Data**: 24 de março de 2026  
**Status**: Pronto para executar

---

## PASSO 1: INFORMAÇÕES DA VPS (REQUEREM SEUS DADOS)

Você precisa fornecer:

```
IP ou Domínio da VPS:    [ _________________________ ]
Porta do Backend:        [ ___________ ] (padrão: 3000)
Protocolo:               [ http / https ]
Usuário teste (email):   [ _________________________ ]
Senha teste:             [ _________________________ ]
```

**Exemplos válidos:**
```
- http://192.168.1.100:3000
- https://api.empresa.com.br
- http://123.45.67.89:3000
```

---

## PASSO 2: CONFIGURAR VITE (Arquivo: c:\ERP\vite.config.ts)

Localize a seção `/api` proxy (por volta da **linha 46-57**):

### ANTES (padrão local):
```typescript
proxy: {
  "/api": {
    target: "http://localhost:3000",  // ← Local
    changeOrigin: true,
    secure: false,
  },
}
```

### DEPOIS (VPS real):
```typescript
proxy: {
  "/api": {
    target: "http://192.168.1.100:3000",  // ← ALTERE AQUI COM SEU IP/URL
    changeOrigin: true,
    secure: false,  // ← Mude para true se usar HTTPS
  },
}
```

---

## PASSO 3: INICIAR FRONTEND

### Opção A: PowerShell (Recomendado)
```powershell
# Abra PowerShell na pasta c:\ERP
cd C:\ERP
. .\start-vps-frontend.ps1
```

### Opção B: Linha de comando (CMD)
```cmd
cd C:\ERP\client
npm run dev
```

### Opção C: Manual com pnpm
```powershell
cd C:\ERP
pnpm dev:client
```

**Esperado no terminal:**
```
  VITE v5.0.0  ready in 234 ms

  ➜  Local:   http://localhost:5173
  ➜  Press h to show help
```

---

## PASSO 4: VALIDAR NO NAVEGADOR

### Teste 4.1: Página carrega
- [ ] Abrir: http://localhost:5173
- [ ] Esperado: Interface React com menu à esquerda
- [ ] Não deve haver erros vermelho no console (F12)

### Teste 4.2: Health check
Abrir DevTools (F12) → Console e colar:

```javascript
fetch('/api/health')
  .then(r => {
    console.log('Status:', r.status);
    return r.json();
  })
  .then(d => console.log('✅ Resposta:', d))
  .catch(e => console.error('❌ Erro:', e.message))
```

**Esperado:**
```
Status: 200
✅ Resposta: { message: "ok", ... }
```

---

## PASSO 5: TESTAR LOGIN

### Teste 5.1: Acessar login
- [ ] Ir para: http://localhost:5173/login
- [ ] Página de login deve aparecer
- [ ] Sem erros de carregamento de CSS/assets

### Teste 5.2: Fazer login
- [ ] Inserir email válido: `[seu_email@email.com]`
- [ ] Inserir senha: `[sua_senha]`
- [ ] Clicar "Entrar"

**Esperado:**
- [ ] Redirect para dashboard (não volta para login)
- [ ] URL muda para: http://localhost:5173/dashboard (ou similar)
- [ ] Menu lateral apareça com opções do sistema
- [ ] Sem erro 401/403/5xx no console

### Teste 5.3: Diagnosticar se falhar
```javascript
// No console, verificar requisição:
localStorage  // Ver tokens armazenados

// Fazer requisição manual:
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'seu@email.com',
    password: 'senha'
  })
})
.then(r => r.json())
.then(d => {
  if (d.error) {
    console.error('❌ Erro do backend:', d.error);
  } else {
    console.log('✅ Token recebido:', d.token?.substring(0, 20) + '...');
  }
})
```

---

## PASSO 6: TESTAR CHAT LEO (se aplicável)

### Teste 6.1: Navegar para chat
- [ ] Após login, procurar menu "Chat" ou "Leo"
- [ ] Clicar para abrir componente de chat

### Teste 6.2: Enviar mensagem
- [ ] Digitar: "Olá, como você funciona?"
- [ ] Enviar mensagem

**Esperado:**
- [ ] Mensagem aparece no histórico
- [ ] Loading spinner enquanto aguarda resposta
- [ ] Resposta da IA aparece após 1-5 segundos
- [ ] Sem erro 5xx no console

### Teste 6.3: Validar endpoint
```javascript
// Verificar requisição para chat:
fetch('/api/leo/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Teste' })
})
.then(r => r.json())
.then(d => {
  console.log('Resposta chat:', d.response || d.message || d);
})
.catch(e => console.error('Erro:', e.message))
```

---

## PASSO 7: VALIDAR CORS (se houver erros)

Erros CORS aparecem como:
```
Access to XMLHttpRequest at 'http://...' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

### Se encontrar erro de CORS:

**Opção 1: Verificar proxy** (recomendado)
- [ ] Confirms `changeOrigin: true` em vite.config.ts
- [ ] Proxy deve estar ativo

**Opção 2: Backend adiciona CORS header** (se projeto necessário)
- [ ] Backend deve retornar: `Access-Control-Allow-Origin: *`
- [ ] Ou específico: `Access-Control-Allow-Origin: http://localhost:5173`

```javascript
// Verificar headers CORS:
fetch('/api/health')
  .then(r => {
    console.log('Headers CORS:', {
      origin: r.headers.get('access-control-allow-origin'),
      methods: r.headers.get('access-control-allow-methods'),
      credentials: r.headers.get('access-control-allow-credentials'),
    });
  })
```

---

## PASSO 8: GERAR RELATÓRIO FINAL

Quando tudo passar, execute:

```powershell
# PowerShell - na raiz do projeto
cd C:\ERP
node validate-frontend-vps.mjs http://192.168.1.100:3000
```

**Esperado no output:**
```
✅ FASE 1: Frontend Vite → OK
✅ FASE 2: Conexão Backend → OK  
✅ FASE 3: Login Real → MANUAL (execute no navegador)
✅ FASE 4: CORS → OK
✅ FASE 5: Chat LEO → MANUAL (execute no navegador)

Estatísticas:
  Total de testes: 15
  Passou: 12 (80%)
  Falhou: 0
  Tempo: 5s
```

---

## TROUBLESHOOTING

| Problema | Solução |
|----------|---------|
| `ECONNREFUSED` | Backend VPS não está rodando ou IP incorreto |
| `Port 5173 already in use` | Outro processo usando a porta. Execute: `netstat -aon \| findstr :5173` |
| `CORS error` | Verificar `changeOrigin: true` e firewall |
| `Cannot GET /` | Frontend vite não está respondendo |
| `404 /api/health` | Proxy não configurado ou backend não tem rota |
| Login falha | Credenciais inválidas ou rota `/api/auth/login` diferente |

---

## PRÓXIMAS AÇÕES

Depois que tudo passar:

1. ✅ Frontend está carregando sem erros
2. ✅ Conectado ao backend VPS real
3. ✅ Login e chat funcionando
4. ✅ Relatório gerado e validado

**Marcas de sucesso final:**
```
✅ Sem erros vermelho no console
✅ Requisições /api/* retornam status válido
✅ Login e sessão funcionam
✅ Chat LEO responde corretamente
```

---

**Última atualização**: 24 mar 2026  
**Mantido por**: Equipe de Engenharia
