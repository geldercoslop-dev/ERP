## 🔥 Integração Frontend ↔ Backend

### ✅ Estrutura Criada

#### 1. **API Client** (`client/src/services/api.ts`)
Camada HTTP simples com tipagem forte:

```typescript
import { api } from './services/api';

// GET
const response = await api.get<DataType>('/endpoint');

// POST
const response = await api.post<DataType>('/endpoint', { body });

// Resposta padronizada
interface ApiResponse<T> {
  ok: boolean;
  error?: string;
  data?: T;
}
```

**Recursos:**
- ✅ Timeout automático (30s)
- ✅ Credentials: include (cookies)
- ✅ Tipagem sem `any`
- ✅ Tratamento de erro 401

---

#### 2. **Auth Service** (`client/src/services/auth.service.ts`)
Serviço de autenticação reutilizável:

```typescript
import { login, logout, getCurrentUser } from './services/auth.service';

// Login
const response = await login({ 
  username: 'admin',
  password: 'senha123'
});

if (response.ok) {
  console.log('Sessão:', response.sessionToken);
  console.log('Usuário:', response.name);
}

// Logout
await logout();

// Verificar usuário logado
const user = await getCurrentUser();
```

**Endpoints Utilizados:**
- `POST /api/auth/login` — fazer login
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — dados do usuário
- `GET /api/user/validate` — validar token

---

### 📋 Como Usar nos Componentes React

#### Exemplo 1: Componente Login com Auth Service

```tsx
import { useState } from 'react';
import { login } from '@/services/auth.service';
import { useLocation } from 'wouter';

export function LoginForm() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(email: string, password: string) {
    setLoading(true);
    setError(null);

    const result = await login({ username: email, password });

    if (!result.ok) {
      setError(result.error || 'Erro ao fazer login');
      setLoading(false);
      return;
    }

    // Login bem-sucedido
    console.log('Conectado como:', result.name);
    setLocation('/dashboard');
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleSubmit(email, password);
    }}>
      {/* seus inputs */}
      <button disabled={loading}>
        {loading ? 'Carregando...' : 'Entrar'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

#### Exemplo 2: Componente com Dados da API

```tsx
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { ApiResponse } from '@/services/api';

interface Cliente {
  id: number;
  nome: string;
  email: string;
}

export function ClientesList() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchClientes();
  }, []);

  async function fetchClientes() {
    const response = await api.get<{ items: Cliente[] }>('/api/clientes');

    if (!response.ok) {
      setError(response.error || 'Erro ao carregar clientes');
      setLoading(false);
      return;
    }

    setClientes(response.data?.items || []);
    setLoading(false);
  }

  if (loading) return <p>Carregando...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <ul>
      {clientes.map(cliente => (
        <li key={cliente.id}>{cliente.nome}</li>
      ))}
    </ul>
  );
}
```

#### Exemplo 3: Criar Service Customizado

```typescript
// client/src/services/clientes.service.ts
import { api } from './api';

export interface Cliente {
  id: number;
  nome: string;
  email: string;
  telefone?: string;
}

export async function listarClientes() {
  return api.get<{ items: Cliente[] }>('/api/clientes');
}

export async function obterCliente(id: number) {
  return api.get<Cliente>(`/api/clientes/${id}`);
}

export async function criarCliente(dados: Omit<Cliente, 'id'>) {
  return api.post<Cliente>('/api/clientes', dados);
}

export async function atualizarCliente(id: number, dados: Partial<Cliente>) {
  return api.put<Cliente>(`/api/clientes/${id}`, dados);
}

export async function deletarCliente(id: number) {
  return api.delete(`/api/clientes/${id}`);
}
```

---

### 🏗️ Fluxo: UI → SERVICE → API → BACKEND

```
┌─────────────────────────────────────────┐
│ Component (React)                       │
│  └─ Estado + UI                         │
└────────────┬────────────────────────────┘
             │ (chama método)
┌────────────▼────────────────────────────┐
│ Service Layer (auth.service.ts)         │
│  └─ Lógica de negócio                   │
│  └─ Tratamento de erro                  │
└────────────┬────────────────────────────┘
             │ (faz requisição)
┌────────────▼────────────────────────────┐
│ API Client (api.ts)                     │
│  └─ GET/POST/PUT/DELETE                 │
│  └─ Timeout + Credentials               │
│  └─ Response normalizada                │
└────────────┬────────────────────────────┘
             │ (HTTP)
┌────────────▼────────────────────────────┐
│ Backend (http://localhost:3000)         │
│  └─ Validação                           │
│  └─ Processamento                       │
│  └─ Banco de dados                      │
└─────────────────────────────────────────┘
```

---

### 🔑 Requisitos do Backend

O backend **DEVE** fornecer:

#### **Autenticação** ✅ (já implementado)
```
POST /api/auth/login
{
  "username": "admin",
  "password": "senha123"
}

Response {
  "ok": true,
  "sessionToken": "u:123",
  "openId": "admin",
  "name": "Administrador",
  "role": "admin",
  "id": 123
}
```

#### **Validação de Sessão** ✅ (já implementado)
```
GET /api/auth/me

Response (se autenticado) {
  "ok": true,
  "data": {
    "id": 123,
    "name": "Admin",
    "role": "admin",
    "openId": "admin"
  }
}

Response (se não autenticado): 401
```

#### **Endpoints Customizados** (conforme necessidade)
```
GET    /api/{resource}           → listar
GET    /api/{resource}/{id}      → obter um
POST   /api/{resource}           → criar
PUT    /api/{resource}/{id}      → atualizar
DELETE /api/{resource}/{id}      → deletar
```

---

### ⚡ Iniciando o Sistema

#### **1. Requisitos**
- Node.js 20+
- MySQL 8.0+ (localmente ou Docker)
- Redis 7+ (localmente ou Docker)

#### **2. Com Docker Compose** (recomendado)
```bash
# Subir infra
docker compose up -d

# Backend
npm run dev

# Frontend (em outro terminal)
cd client
npm run dev
```

#### **3. Localmente (sem Docker)**
```bash
# SETUP MANUAL (MySQL + Redis devem estar rodando)
mysql -u vendas -pvendas123 -e "CREATE DATABASE IF NOT EXISTS erp"
npm run db:push:dev

# Backend
npm run dev

# Frontend
cd client
npm run dev
```

---

### 🧪 Testando a Integração

#### **1. Verificar Backend**
```bash
curl http://localhost:3000/health
```

#### **2. Fazer Login**
```javascript
// No console do navegador (localhost:5173)
import { login } from '/src/services/auth.service.ts';

await login({ 
  username: 'admin', 
  password: 'senha' 
});
```

#### **3. Chamar API**
```javascript
import { api } from '/src/services/api.ts';

const response = await api.get('/api/clientes');
console.log(response);
```

---

### 📚 Arquivos Criados/Modificados

✅ **New Files:**
- `client/src/services/api.ts` — Cliente HTTP base
- `client/src/services/auth.service.ts` — Serviço de autenticação

📝 **Existing Files:**
- `client/src/pages/Login.tsx` — Já integrado com `useAuthStore`
- `server/routers/smart-auth.ts` — Backend implementado

---

### 🐛 Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `ERR_CONNECTION_REFUSED` | Backend não rodando | `npm run dev` na raiz |
| `Não autorizado` (401) | Cookie não válido | Limpar cookies/logout, fazer login novamente |
| `Redis: ECONNREFUSED` | Redis não rodando | `docker compose up -d` ou instalar localmente |
| `MySQL: ECONNREFUSED` | MySQL não rodando | `docker compose up -d` ou instalar localmente |

---

### ✨ Próximos Passos

1. **Expandir Services**
   - Criar `clientes.service.ts`
   - Criar `pedidos.service.ts`
   - Criar `relatorios.service.ts`

2. **Adicionar Validação**
   - Zod schemas para input
   - Fila de requisições
   - Retry automático

3. **Melhorar UX**
   - Loading states globais
   - Toast notifications
   - Error boundaries

4. **Performance**
   - React Query para cache
   - Lazy loading
   - Code splitting

---

**🎯 Resumo:** Você agora tiene:
- ✅ API client tipado
- ✅ Auth service reutilizável
- ✅ Pattern de services bem estruturado
- ✅ Frontend → Backend integrado
- ✅ Sem `any` types
- ✅ Pronto para producção
