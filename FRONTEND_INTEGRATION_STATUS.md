# 🔥 Integração Frontend-Backend: Status Final

**Data:** 27 de Março de 2026  
**Status:** ✅ IMPLEMENTADO E PRONTO PARA USAR

---

## 📋 O que foi criado

### 1. **API Client** (`client/src/services/api.ts`)
✅ Cliente HTTP simples e tipado para comunicação com o backend

**Features:**
- ✅ Métodos: `get()`, `post()`, `put()`, `delete()`
- ✅ Tipagem forte (sem `any`)
- ✅ Timeout automático: 30 segundos
- ✅ Credenciais automáticas (cookies)
- ✅ Tratamento padronizado de erros
- ✅ Response normalizado: `{ ok, data, error }`

**Uso:**
```typescript
import { api } from '@/services/api';

const response = await api.get('/api/clientes');
if (response.ok) {
  console.log(response.data);
}
```

---

### 2. **Auth Service** (`client/src/services/auth.service.ts`)
✅ Serviço de autenticação pronto para usar

**Funções:**
- `login(credentials)` — fazer login
- `logout()` — fazer logout
- `getCurrentUser()` — obter usuário logado
- `validateToken()` — validar sessão
- `storeToken()` / `getStoredToken()` — gerenciar token

**Uso:**
```typescript
import { login } from '@/services/auth.service';

const result = await login({ username: 'admin', password: 'senha' });
if (result.ok) {
  console.log('Logado como:', result.name);
}
```

---

### 3. **React Hooks** (`client/src/hooks/useApi.ts`)
✅ Hooks customizados para integração com React

**Hooks:**
- `useApiGet<T>(endpoint)` — fazer GET
- `useApiMutation(method)` — fazer POST/PUT/DELETE
- `useApiMultiple(endpoints)` — múltiplos requests em paralelo

**Uso:**
```typescript
import { useApiGet, useApiMutation } from '@/hooks/useApi';

// GET
const { data, loading, error, refetch } = useApiGet('/api/clientes', { immediate: true });

// POST
const { execute: criar } = useApiMutation('post');
await criar('/api/clientes', { nome: 'Novo' });
```

---

### 4. **Exemplo Prático** (`client/src/pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx`)
✅ Página de exemplo mostrando padrão completo: GET + POST + UI

O que demonstra:
- Carregar lista com `useApiGet`
- Criar novo item com `useApiMutation`
- Estados de loading/error
- UI responsiva
- Tipagem forte

---

### 5. **Documentação**
✅ Guias completos criados:

| Arquivo | Conteúdo |
|---------|----------|
| [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) | 📚 Guia completo com exemplos |
| [`QUICKSTART.md`](./QUICKSTART.md) | ⚡ Início rápido (2 minutos) |
| [`test-integration.js`](./test-integration.js) | 🧪 Script de teste no console |

---

## 🎯 Como Usar

### **Passo 1: Entender o Fluxo**

```
┌─────────────────┐
│ React Component │  ← useApiGet, useApiMutation
└────────┬────────┘
         │
┌────────▼─────────────┐
│ Service Layer        │  ← login(), getCurrentUser()
│ (auth.service.ts)    │
└────────┬─────────────┘
         │
┌────────▼─────────────┐
│ Api Client           │  ← api.get(), api.post()
│ (api.ts)             │
└────────┬─────────────┘
         │
┌────────▼─────────────┐
│ Backend (localhost:3000)
│ - auth.login
│ - /api/clientes
│ - /api/pedidos
└──────────────────────┘
```

### **Passo 2: Criar um Novo Service**

```typescript
// client/src/services/clientes.service.ts
import { api } from './api';

export interface Cliente {
  id: number;
  nome: string;
  email: string;
}

export function listarClientes() {
  return api.get<{ items: Cliente[] }>('/api/clientes');
}

export function criarCliente(dados: Omit<Cliente, 'id'>) {
  return api.post<Cliente>('/api/clientes', dados);
}
```

### **Passo 3: Usar em um Componente**

```typescript
import { useApiGet, useApiMutation } from '@/hooks/useApi';
import { listarClientes, criarCliente } from '@/services/clientes.service';

export function ClientesList() {
  const { data, loading } = useApiGet('/api/clientes', { immediate: true });
  const { execute: criar } = useApiMutation('post');

  return (
    <>
      <h1>Clientes ({data?.items.length || 0})</h1>
      {loading ? <p>Carregando...</p> : (
        <ul>
          {data?.items.map(c => <li key={c.id}>{c.nome}</li>)}
        </ul>
      )}
    </>
  );
}
```

---

## ✅ Checklist: Pré-requisitos

Antes de rodar o sistema, certifique-se de:

- [ ] Node.js 20+ instalado (`node --version`)
- [ ] MySQL 8.0+ rodando em localhost:3306 ou Docker
- [ ] Redis 7+ rodando em localhost:6379 ou Docker
- [ ] `.env.development` configurado (já está em git)

**Com Docker:**
```bash
docker compose up -d mysql redis
```

**Sem Docker (local):**
Instale MySQL e Redis manualmente no seu SO.

---

## 🚀 Iniciando o Sistema

### **Terminal 1: Backend**
```bash
cd /c/ERP
npm run dev
# Aguarde: "[BOOT] Server listening on port 3000"
```

### **Terminal 2: Frontend**
```bash
cd /c/ERP/client
npm run dev
# Abra: http://localhost:5173
```

### **Terminal 3 (opcional): Testes**
```bash
# No console do navegador (F12)
# Cole o conteúdo de client/src/services/test-integration.js
```

---

## 🧪 Testando

### **Teste 1: Verificar Backend**
```bash
curl http://localhost:3000/health
# Resposta: {"ok":true} ou {"status":"ok"}
```

### **Teste 2: Fazer Login**

**Via Console Browser:**
```javascript
// Cole em http://localhost:5173 → F12 → Console
const result = await (await fetch('http://localhost:3000/api/trpc/auth.login?batch=1', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 0: { username: 'admin', password: 'admin' } })
})).json();

console.log(result);
```

### **Teste 3: Usar API Client**
```javascript
// No console do navegador
import { api } from 'http://localhost:5173/src/services/api.ts';
const response = await api.get('/api/clientes');
console.log(response);
```

---

## 📁 Estrutura de Arquivos

```
client/src/
├── pages/
│   ├── Login.tsx                       [já existe + funcionando]
│   └── EXEMPLO_INTEGRACAO_CLIENTES.tsx [👈 ESTUDE ESTE]
│
├── services/
│   ├── api.ts                          [✅ NOVO - Cliente HTTP]
│   ├── auth.service.ts                 [✅ NOVO - Auth]
│   ├── INTEGRATION_GUIDE.md            [📚 Documentação completa]
│   ├── QUICKSTART.md                   [⚡ Guia rápido]
│   └── test-integration.js             [🧪 Script de teste]
│
├── hooks/
│   └── useApi.ts                       [✅ NOVO - Hooks React]
│
└── store/
    └── authStore.ts                    [já existe + integrado]
```

---

## 🔑 Endpoints Disponíveis

O backend JÁ IMPLEMENTA (em `server/routers/smart-auth.ts`):

```
POST /api/trpc/auth.login
  → { username: string, password: string }
  ← { ok: boolean, sessionToken: string, name: string, role: string }

POST /api/trpc/auth.logout
  → {}
  ← { ok: boolean }

GET /api/trpc/auth.me
  → (sem body)
  ← { id: number, name: string, role: string } ou 401
```

---

## 🛠️ Troubleshooting

| Erro | Solução |
|------|---------|
| `ERR_CONNECTION_REFUSED localhost:3000` | Backend não rodando - rode `npm run dev` |
| `ERR_CONNECTION_REFUSED localhost:5173` | Frontend não rodando - rode `cd client && npm run dev` |
| `Redis: ECONNREFUSED` | Redis não rodando - `docker compose up -d redis` |
| `MySQL: ECONNREFUSED` | MySQL não rodando - `docker compose up -d mysql` |
| `401 Unauthorized` | Não autenticado - faça login primeiro |
| `CORS error` | Backend sem CORS configurado - verificar `vite.config.ts` |

---

## 💡 Boas Práticas

### ✅ FAÇA

```typescript
// 1. Use services para abstrair lógica
const result = await login(credentials);

// 2. Sempre valide a resposta
if (!response.ok) {
  toast.error(response.error);
  return;
}

// 3. Use hooks para estado de requisição
const { data, loading, error } = useApiGet('/api/...');

// 4. Tipifique dados fortemente
interface Usuario {
  id: number;
  nome: string;
  email: string;
}
const response = await api.get<Usuario>('/api/me');
```

### ❌ NÃO FAÇA

```typescript
// 1. Não use `any`
const data: any = response.data;  // ❌

// 2. Não faça requisição direta em componente
useEffect(() => {
  fetch(...)  // ❌ Use useApiGet
}, []);

// 3. Não ignore erros
try { await login(...); } catch {}  // ❌

// 4. Não misture contextos
const [client] = useClient();  // ❌ Use services
```

---

## 📈 Proximos Passos Recomendados

1. **Expandir Services**
   - Criar `pedidos.service.ts`
   - Criar `estoque.service.ts`
   - Criar `vendas.service.ts`

2. **Adicionar Validação**
   - Zod schemas
   - Form validation
   - Input sanitization

3. **Performance**
   - Implementar React Query para caching
   - Lazy loading de componentes
   - Code splitting

4. **Observabilidade**
   - Adicionar logging
   - Rastreamento de erros (Sentry)
   - Métricas de performance

---

## 📞 Suporte

Consulte:
- [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) — Documentação completa
- [`EXEMPLO_INTEGRACAO_CLIENTES.tsx`](../pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx) — Código de exemplo
- Backend: [`server/routers/smart-auth.ts`](../../../server/routers/smart-auth.ts) — Implementação do backend

---

**✨ Sistema integrado e pronto para producción! 🚀**
