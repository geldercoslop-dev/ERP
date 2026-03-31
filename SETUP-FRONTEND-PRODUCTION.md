# 📋 SETUP FRONTEND + BACKEND REAL - GUIA EXECUTÁVEL

**Status**: Pronto para execução em 5 fases  
**Data**: 24 de março de 2026  
**Objetivo**: Subir frontend Vite + conectar backend real (VPS)

---

## ⚠️ PRÉ-REQUISITOS OBRIGATÓRIOS

Antes de começar, você precisa fornecer:

1. **IP ou URL da VPS Backend**  
   Exemplo: `http://123.456.789.100:3000` ou `https://api.seudominio.com`
   
2. **Credenciais de login válidas** (para testes de login)  
   Exemplo: usuário/senha existentes no backend VPS

---

## FASE 1 ✅ — SUBIR FRONTEND VITE

### Comando
```ps1
# PowerShell - execute na raiz do projeto
cd C:\ERP
npm run dev:client
# Ou alternativamente:
cd C:\ERP\client
npx vite --port 5173 --host
```

### Validação
- [ ] Terminal mostra: `Local: http://localhost:5173`
- [ ] Não há erros TypeScript/build
- [ ] Porta 5173 disponível

### Teste Manual
```
🌐 Abra no navegador: http://localhost:5173
✅ Esperado: Página carrega com interface React
✅ Esperado: Sem erros vermelho no console
```

---

## FASE 2 🔌 — CONECTAR BACKEND REAL (VPS)

### Passo 1: Identificar URL da VPS
**Você precisa fornecer o IP/URL real.**  
Exemplos:
```
- Direto: http://192.168.x.x:3000
- Domínio: https://erp-backend.seudominio.com
- Com porta: http://api.empresa.com.br:3000
```

### Passo 2: Configurar Frontend para VPS

#### OPÇÃO A: Ajustar arquivo de config (Recomendado)
Arquivo: `c:\ERP\vite.config.ts`

Localizar a seção `proxy` (linha 46-57):
```typescript
proxy: {
  "/api": {
    target: "http://localhost:3000",  // ← ALTERAR AQUI
    changeOrigin: true,
    secure: false,
  },
}
```

**Substituir por** (exemplo com IP VPS):
```typescript
proxy: {
  "/api": {
    target: "http://192.168.1.100:3000",  // ← IP da VPS
    changeOrigin: true,
    secure: true,  // Se usar HTTPS
  },
}
```

#### OPÇÃO B: Alterar variável de ambiente
Crie/edite: `c:\ERP\client\.env.local`
```
VITE_API_URL=http://192.168.1.100:3000
```

### Passo 3: Reiniciar frontend
```ps1
# Parar o Vite (Ctrl+C)
# Depois rodar novamente:
npm run dev:client
```

### Validação
- [ ] Frontend iniciado com sucesso
- [ ] Nenhum erro de compilação
- [ ] Proxy configurado para novo target

---

## FASE 3 🏥 — TESTAR SAÚDE DA API

### Teste com curl (PowerShell)
```ps1
# Windows PowerShell
$response = Invoke-WebRequest -Uri "http://localhost:5173/api/health" -ErrorAction Ignore
$response.StatusCode
# Esperado: 200 ou similar

# Ou verificar resposta completa:
Invoke-RestMethod -Uri "http://localhost:5173/api/health" | Select-Object -Property *
```

### Teste no Console do Navegador
1. Abra DevTools (F12)
2. Console (Ctrl+Shift+K)
3. Cole:
```javascript
fetch('/api/health')
  .then(r => r.json())
  .then(d => console.log('✅ OK', d))
  .catch(e => console.error('❌ ERRO', e))
```

### Validação
- [ ] Resposta retorna 200 OK
- [ ] Corpo da resposta é válido JSON
- [ ] Sem erros de CORS
- [ ] Timestamp/dados esperados

---

## FASE 4 🔐 — LOGIN COM BACKEND REAL

### Localizar página de login
```
Frontend URL: http://localhost:5173
Página de login: http://localhost:5173/login
```

### Teste Manual
1. Abrir: `http://localhost:5173/login`
2. Inserir credenciais válidas:
   - **Usuário**: `[seu_usuario]`
   - **Senha**: `[sua_senha]`
3. Clicar em "Entrar"

### Validação de sucesso
- [ ] Sem erro "Cannot POST /api/..."
- [ ] Sem erro 403/401/5xx
- [ ] Redireciona para dashboard/página principal
- [ ] Token/sessão armazenado em localStorage/cookies
- [ ] Console sem erros vermelho

### Se falhar - Diagnóstico
```javascript
// No console do navegador:
// 1. Verificar requisição de login
console.log(localStorage); // Ver tokens salvos

// 2. Fazer requisição manual
fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@email.com', password: 'senha' })
})
.then(r => r.json())
.then(d => console.log('Resposta:', d))
```

---

## FASE 5 💬 — CONECTAR CHAT LEO

### Teste Manual

#### Passo 1: Navegue para chat
```
Dentro do dashboard, localize o componente LEO Chat
Endpoint esperado: /api/leo/chat
```

#### Passo 2: Enviar mensagem teste
- Digite uma mensagem simples: "Olá"
- Clique em "Enviar"

#### Passo 3: Validação
- [ ] Mensagem enviada sem erro
- [ ] Resposta da IA aparece na tela
- [ ] Console sem erros 4xx/5xx
- [ ] Requisição leva tempo normal (1-5 segundos)

### Teste com Fetch
```javascript
// No console do navegador
fetch('/api/leo/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Teste 123' })
})
.then(r => r.json())
.then(d => console.log('Chat respuesta:', d))
.catch(e => console.error('Erro:', e.message))
```

---

## VALIDAÇÃO FINAL ✅

### Checklist completo

#### Frontend
- [ ] Página carrega em http://localhost:5173
- [ ] Sem erros de compilação
- [ ] Estilos e ícones aparecem correto
- [ ] Menu navegável

#### Conexão com Backend
- [ ] `/api/health` responde 200
- [ ] Sem erros de CORS (se houver)
- [ ] Requisições aparecem no Network tab

#### Autenticação
- [ ] Login funciona com credenciais reais
- [ ] Token/sessão armazenado
- [ ] Redirecionamento para dashboard
- [ ] Logout funciona

#### Chat LEO
- [ ] Acesso ao componente de chat (se existe)
- [ ] Envio de mensagem funciona
- [ ] Resposta recebida do backend
- [ ] Sem timeouts ou erros 5xx

#### Console do Navegador (F12)
```
Esperado:
✅ Sem mensagens de erro (vermelho)
✅ Sem warnings críticos (amarelo)
✅ Requests para /api/* com status 200-299 ou 3xx
✅ Requests para /api/* com status 401/403 significam autenticação OK
```

---

## TROUBLESHOOTING

### Erro: "ECONNREFUSED - Ninguém escutando na porta 3000"
**Causa**: Backend não está rodando ou IP está incorreto  
**Solução**: 
1. Verificar se backend VPS está ativo
2. Confirmar IP/porta corretos no `vite.config.ts`
3. Testar conectividade: `ping [IP-VPS]`

### Erro: "CORS error - Access denied"
**Causa**: Backend VPS não allow origin do frontend  
**Solução**:
1. Verificar CORS headers do backend
2. Adicionar `changeOrigin: true` no proxy
3. Se HTTPS: ajustar `secure: true|false`

### Erro: "Cannot find module vite"
**Causa**: node_modules não foi instalado  
**Solução**:
```ps1
cd c:\ERP\client
npm install
```

### Login falha mas health OK
**Causa**: Rota `/api/auth/login` não configurado ou credenciais inválidas  
**Solução**:
1. Verificar usuários no backend VPS
2. Confirmar rota exactly (pode ser `/auth/login` ou outro)
3. Testar credenciais manualmente via Postman/curl

---

## RELATORIO FINAL

Quando tudo passar, execute este comando para gerar relatório:

```ps1
# Cria snapshot do sistema de testes
node c:\ERP\GENERATE_FINAL_REPORT.mjs
```

Relatório incluirá:
- ✅ Status de cada fase
- ✅ Endpoints testados com respostas
- ✅ Logs de console (sem erros)
- ✅ Tempo de resposta da API
- ✅ Validação de CORS
- ✅ Health check do backend

---

## PRÓXIMOS PASSOS

1. **Forneça o IP/URL da VPS** (comentário abaixo)
2. **Execute cada fase sequencialmente**
3. **Registre os resultados** no console/Network tab
4. **Gere relatório final** quando tudo passar

### Informações necessárias de você:
```
IP/URL da VPS Backend: ________________
Porta do backend: ________________
Protocolo (http/https): ________________
Usuário teste (email): ________________
Senha teste: ________________
```

---

**Última atualização**: 24 de março de 2026  
**Versão**: 1.0
