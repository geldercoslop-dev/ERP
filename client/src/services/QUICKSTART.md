## ⚡ QUICKSTART: Integração Frontend ↔ Backend

### Criado Hoje ✅

```
client/src/services/
├── api.ts              ← Cliente HTTP base (GET, POST, PUT, DELETE)
├── auth.service.ts     ← Serviço de autenticação
└── INTEGRATION_GUIDE.md ← Documentação completa (👈 LEIA ESTE)

client/src/hooks/
├── useApi.ts           ← Hooks React para requisições (useApiGet, useApiMutation)

client/src/pages/
└── EXEMPLO_INTEGRACAO_CLIENTES.tsx ← Exemplo prático (👈 ESTUDE ESTE)
```

---

### 🚀 Para Começar Agora

#### **Passo 1: Subir Backend + Frontend**

```bash
# Terminal 1 - Backend (raiz do projeto)
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

#### **Passo 2: Testar Login**

Abra `http://localhost:5173/login`

- Usuário: `admin`
- Senha: (defina no seed do banco)

#### **Passo 3: Usar em Componentes**

```typescript
// Imports
import { login } from '@/services/auth.service';
import { useApiGet } from '@/hooks/useApi';

// Login
const result = await login({ username: 'admin', password: 'senha' });
if (result.ok) console.log('Conectado!');

// Carregar dados
const { data, loading, error } = useApiGet('/api/clientes', { immediate: true });

// Criar algo
const { execute: criar } = useApiMutation('post');
await criar('/api/clientes', { nome: 'Novo Cliente' });
```

---

### 📚 Arquivos Importantes

| Arquivo | Descrição |
|---------|-----------|
| [`client/src/services/INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) | **👈 DOCUMENTAÇÃO COMPLETA** |
| [`client/src/services/api.ts`](./api.ts) | Cliente HTTP base |
| [`client/src/services/auth.service.ts`](./auth.service.ts) | Serviço de auth |
| [`client/src/hooks/useApi.ts`](../hooks/useApi.ts) | Hooks React |
| [`client/src/pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx`](../pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx) | Exemplo completo |

---

### ✨ Padrão de Código

```typescript
// ❌ NÃO FAZER
fetch('/api/...')
  .then(r => r.json())
  .catch(e => console.error(e));

// ✅ FAZER ASSIM
import { api } from '@/services/api';

const response = await api.get('/api/dados');
if (response.ok) {
  console.log(response.data);
}
```

---

### 🎯 Próximos Passos

1. **Criar mais services**
   - `pedidos.service.ts`
   - `estoque.service.ts`
   - `financeiro.service.ts`

2. **Expandir páginas**
   - Copiar padrão de `EXEMPLO_INTEGRACAO_CLIENTES.tsx`
   - Usar `useApiGet` e `useApiMutation`

3. **Performance**
   - Adicionar React Query para caching
   - Implementar lazy loading

---

**Pronto para usar! 🚀**

Leia [`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md) para detalhes.
