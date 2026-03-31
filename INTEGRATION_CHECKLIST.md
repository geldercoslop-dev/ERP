# 🚀 CHECKLIST: Usar a Integração Frontend-Backend

## ✅ Pré-requisitos

- [ ] Node.js 20+ instalado
- [ ] MySQL 8.0+ rodando (localhost:3306)
- [ ] Redis 7+ rodando (localhost:6379)
  - **Com Docker:** `docker compose up -d`
  - **Sem Docker:** Instale localmente
- [ ] `.env.development` configurado (já está no git)

---

## 🎯 FASE 1: Compreender a Arquitetura (10 min)

- [ ] Ler [FRONTEND_INTEGRATION_STATUS.md](./FRONTEND_INTEGRATION_STATUS.md)
- [ ] Ler [client/src/services/INTEGRATION_GUIDE.md](./client/src/services/INTEGRATION_GUIDE.md)
- [ ] Estudar [client/src/pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx](./client/src/pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx)

---

## 🔧 FASE 2: Iniciar o Sistema (5 min)

### Terminal 1 - Backend
```bash
cd c:\ERP
npm run dev
```
✅ Aguarde mensagem: `[BOOT] Server listening on port 3000`

### Terminal 2 - Frontend
```bash
cd c:\ERP\client
npm run dev
```
✅ Aguarde mensagem: `Local: http://localhost:5173`

### Terminal 3 - Testes (opcional)
```bash
cd c:\ERP
node INTEGRATION_SUMMARY.js
```

---

## 📋 FASE 3: Testar Login (5 min)

1. **Abra no navegador:**
   - http://localhost:5173/login

2. **Faça login:**
   - Username: `admin` (ou nome de usuário em seu DB)
   - Password: (de acordo com seu seed)

3. **Esperado:**
   - ✅ Redirecionamento para /dashboard
   - ✅ Estado de autenticação no navegador

---

## 🧪 FASE 4: Testar API Client (5 min)

1. **Abra o console do navegador** (F12)

2. **Cole o script de teste:**
   Copie o conteúdo de [client/src/services/test-integration.js](./client/src/services/test-integration.js)

3. **Resultado esperado:**
   ```
   ✅ 5/5 testes passaram (100%)
   🎉 Sistema pronto para usar!
   ```

---

## 💻 FASE 5: Usar os Services (começar a programar!)

### Exemplo 1: Fazer Login Programaticamente

```typescript
import { login } from '@/services/auth.service';

async function handleLogin(username: string, password: string) {
  const result = await login({ username, password });
  
  if (result.ok) {
    console.log('Conectado como:', result.name);
    // Redirecionar para dashboard
  } else {
    console.error('Erro:', result.error);
  }
}
```

### Exemplo 2: Carregar Dados via Hook

```typescript
import { useApiGet } from '@/hooks/useApi';

export function ClientesList() {
  const { data, loading, error, refetch } = useApiGet(
    '/api/clientes',
    { immediate: true }
  );

  if (loading) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error}</p>;

  return (
    <>
      <h1>Clientes ({data?.items.length})</h1>
      {data?.items.map(c => <div key={c.id}>{c.nome}</div>)}
    </>
  );
}
```

### Exemplo 3: Criar Algo Novo

```typescript
import { useApiMutation } from '@/hooks/useApi';

export function CreateCliente() {
  const { execute: criar, loading } = useApiMutation('post');

  async function handleSubmit(nome: string, email: string) {
    const result = await criar('/api/clientes', {
      nome,
      email
    });

    if (result) {
      console.log('Cliente criado:', result);
    }
  }

  return (
    <button onClick={() => handleSubmit('João', 'joao@email.com')} disabled={loading}>
      {loading ? 'Criando...' : 'Criar'}
    </button>
  );
}
```

---

## 🏗️ FASE 6: Criar seus Próprios Services

### Template: `client/src/services/pedidos.service.ts`

```typescript
import { api } from './api';

export interface Pedido {
  id: number;
  numero: string;
  cliente_id: number;
  total: number;
  status: 'pendente' | 'confirmado' | 'enviado' | 'entregue';
  created_at: string;
}

// GET
export function listarPedidos() {
  return api.get<{ items: Pedido[] }>('/api/pedidos');
}

export function obterPedido(id: number) {
  return api.get<Pedido>(`/api/pedidos/${id}`);
}

// POST
export function criarPedido(dados: Omit<Pedido, 'id' | 'created_at'>) {
  return api.post<Pedido>('/api/pedidos', dados);
}

// PUT
export function atualizarPedido(id: number, dados: Partial<Pedido>) {
  return api.put<Pedido>(`/api/pedidos/${id}`, dados);
}

// DELETE
export function deletarPedido(id: number) {
  return api.delete(`/api/pedidos/${id}`);
}
```

### Template: `client/src/pages/Pedidos.tsx`

```typescript
import { useApiGet, useApiMutation } from '@/hooks/useApi';
import { listarPedidos } from '@/services/pedidos.service';

export function PedidosPage() {
  const { data, loading, error, refetch } = useApiGet('/api/pedidos', { immediate: true });
  const { execute: criar } = useApiMutation('post');

  const pedidos = data?.items || [];

  return (
    <div>
      <h1>Pedidos</h1>
      
      {error && <p className="error">{error}</p>}
      
      <button onClick={refetch} disabled={loading}>
        {loading ? 'Carregando...' : 'Recarregar'}
      </button>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Número</th>
            <th>Status</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map(pedido => (
            <tr key={pedido.id}>
              <td>{pedido.id}</td>
              <td>{pedido.numero}</td>
              <td>{pedido.status}</td>
              <td>R$ {pedido.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PedidosPage;
```

---

## 🎯 FASE 7: Próximos Passos

- [ ] Criar `estoque.service.ts`
- [ ] Criar `vendas.service.ts`
- [ ] Criar `financeiro.service.ts`
- [ ] Adicionar validação com Zod
- [ ] Implementar React Query para caching
- [ ] Adicionar tratamento de sessão em global
- [ ] Criar componentes reutilizáveis

---

## 🆘 Troubleshooting Rápido

### "ERR_CONNECTION_REFUSED localhost:3000"
- [ ] Backend não está rodando
- [ ] Solução: `npm run dev` na raiz

### "ERR_CONNECTION_REFUSED localhost:5173"
- [ ] Frontend não está rodando
- [ ] Solução: `cd client && npm run dev`

### "Redis: ECONNREFUSED"
- [ ] Redis não está rodando
- [ ] Solução: `docker compose up -d redis` (requer Docker)

### "MySQL: ECONNREFUSED"
- [ ] MySQL não está rodando
- [ ] Solução: `docker compose up -d mysql` (requer Docker)

### "401 Unauthorized"
- [ ] Você não está autenticado
- [ ] Solução: Faça login em /login

### "TypeError: api.get is not a function"
- [ ] a.ts não foi importado corretamente
- [ ] Solução: Verifique import path

---

## 📚 Referências Rápidas

| Necessidade | Arquivo |
|---|---|
| Entender fluxo completo | [INTEGRATION_GUIDE.md](./client/src/services/INTEGRATION_GUIDE.md) |
| Copiar padrão | [EXEMPLO_INTEGRACAO_CLIENTES.tsx](./client/src/pages/EXEMPLO_INTEGRACAO_CLIENTES.tsx) |
| API Client | [api.ts](./client/src/services/api.ts) |
| Auth Service | [auth.service.ts](./client/src/services/auth.service.ts) |
| Hooks | [useApi.ts](./client/src/hooks/useApi.ts) |
| Testar API | [test-integration.js](./client/src/services/test-integration.js) |
| Backend auth | [server/routers/smart-auth.ts](./server/routers/smart-auth.ts) |

---

## ✨ Resumo

```json
{
  "O que foi criado": [
    "✅ API Client (api.ts)",
    "✅ Auth Service (auth.service.ts)",
    "✅ React Hooks (useApi.ts)",
    "✅ Exemplo Prático",
    "✅ Documentação Completa",
    "✅ Script de Teste"
  ],
  "Padrão": "UI → Service → API Client → Backend",
  "TypeScript": "100% tipado (zero `any`)",
  "Status": "✅ Pronto para usar",
  "Tempo para começar": "5-10 minutos"
}
```

---

**🎉 Boa sorte! A integração está pronta para usar! 🚀**
