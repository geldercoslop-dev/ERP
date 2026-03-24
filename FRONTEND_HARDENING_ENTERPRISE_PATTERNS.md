# 🎓 FRONTEND HARDENING ENTERPRISE - PADRÕES & EXEMPLOS

---

## 1. ErrorBoundaryPro - Padrões

### ✅ Padrão 1: App Root
```typescript
// App.tsx
import { ErrorBoundaryPro } from '@/components/ErrorBoundaryPro';
import Router from './Router';
import * as Sentry from '@sentry/react';

export default function App() {
  return (
    <ErrorBoundaryPro
      level="critical"
      onError={(error, errorInfo) => {
        console.error('Critical error:', error);
        // Custom logging
      }}
    >
      <Router />
    </ErrorBoundaryPro>
  );
}
```

### ✅ Padrão 2: Componente Crítico com ErrorBoundary
```typescript
// pages/Dashboard.tsx
import { ErrorBoundaryPro } from '@/components/ErrorBoundaryPro';

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Seção crítica protegida */}
      <ErrorBoundaryPro
        level="warning"
        fallback={<DashboardLoadingError />}
      >
        <AnalyticsDashboard />
      </ErrorBoundaryPro>

      {/* Outra seção crítica */}
      <ErrorBoundaryPro level="info">
        <ReportsSection />
      </ErrorBoundaryPro>
    </div>
  );
}
```

### ✅ Padrão 3: HOC com ErrorBoundary
```typescript
// protected-dashboard.tsx
import { withErrorBoundary } from '@/components/ErrorBoundaryPro';
import Dashboard from './Dashboard';

export const ProtectedDashboard = withErrorBoundary(Dashboard, {
  level: 'critical',
  fallback: (
    <div className="text-center mt-20">
      <p>Dashboard indisponível no momento</p>
      <button onClick={() => window.location.reload()}>Recarregar</button>
    </div>
  ),
});

// App.tsx
import { ProtectedDashboard } from '@/pages/protected-dashboard';

<Route path="/dashboard" element={<ProtectedDashboard />} />
```

---

## 2. HttpClient - Padrões

### ✅ Padrão 1: Service com HttpClient
```typescript
// services/userService.ts
import { httpClient } from '@/lib/http-client';
import type { ApiResponse } from '@/types/api';
import type { User, UpdateUserPayload } from '@/types';
import { UpdateProfileSchema } from '@/schemas/validation';

// Get user
export async function getUser(id: string): Promise<ApiResponse<User>> {
  const result = await httpClient.get<User>(`/users/${id}`);
  
  if (result.ok) {
    return { data: result.data };
  }
  
  throw new AppError(
    result.error.message,
    result.error.code as ErrorCode,
    result.error.status
  );
}

// Update user
export async function updateUser(
  id: string,
  payload: UpdateUserPayload
): Promise<ApiResponse<User>> {
  // Validar payload antes de enviar
  const { valid, data, error } = validatePayload<UpdateUserPayload>(
    UpdateProfileSchema,
    payload
  );
  
  if (!valid) {
    throw new AppError(error || 'Validação falhou', ErrorCode.VALIDATION_ERROR);
  }

  const result = await httpClient.put<User, UpdateUserPayload>(
    `/users/${id}`,
    data
  );
  
  if (!result.ok) {
    throw new AppError(result.error.message, result.error.code as ErrorCode);
  }
  
  return { data: result.data };
}

// Delete user
export async function deleteUser(id: string): Promise<null> {
  const result = await httpClient.delete(`/users/${id}`);
  
  if (!result.ok) {
    throw new AppError(result.error.message, result.error.code as ErrorCode);
  }
  
  return null;
}
```

### ✅ Padrão 2: Hook que usa Service
```typescript
// hooks/useUser.ts
import { useState, useCallback } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import * as userService from '@/services/userService';
import type { User } from '@/types';

interface UseUserOptions {
  userId: string;
  autoFetch?: boolean;
}

export function useUser({ userId, autoFetch = true }: UseUserOptions) {
  useProtectedRoute({ requireAuth: true });

  const {
    data: user,
    loading,
    error,
    execute: fetchUser,
  } = useAsyncAction(
    () => userService.getUser(userId),
    {
      onSuccess: (user) => console.log('User loaded:', user),
      onError: (error) => console.error('Failed to load user:', error),
    }
  );

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchUser();
    }
  }, [userId, autoFetch, fetchUser]);

  return {
    user,
    loading,
    error,
    refetch: fetchUser,
  };
}
```

### ✅ Padrão 3: Form com Validação e Request
```typescript
// components/LoginForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type LoginPayload } from '@/schemas/validation';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { httpClient } from '@/lib/http-client';
import { frontendLogger } from '@/monitoring';

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginPayload>({
    resolver: zodResolver(LoginSchema),
  });

  const { execute: login, loading, error } = useAsyncAction(
    async (payload: LoginPayload) => {
      frontendLogger.logCriticalAction({
        action: 'login',
        status: 'start',
        context: { email: payload.email },
      });

      const result = await httpClient.post<AuthToken, LoginPayload>(
        '/auth/login',
        payload
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      frontendLogger.logCriticalAction({
        action: 'login',
        status: 'success',
        context: { email: payload.email },
      });

      return result.data;
    },
    {
      onSuccess: (token) => {
        localStorage.setItem('authToken', token.accessToken);
        navigate('/dashboard');
      },
      onError: (error) => {
        frontendLogger.error({
          message: 'Login falhou',
          error,
        });
      },
    }
  );

  return (
    <form onSubmit={handleSubmit(login)}>
      <input
        {...register('email')}
        type="email"
        placeholder="Email"
      />
      {errors.email && <span>{errors.email.message}</span>}

      <input
        {...register('password')}
        type="password"
        placeholder="Senha"
      />
      {errors.password && <span>{errors.password.message}</span>}

      <button disabled={loading} type="submit">
        {loading ? 'Entrando...' : 'Entrar'}
      </button>

      {error && <p className="error">{error.message}</p>}
    </form>
  );
}
```

---

## 3. FrontendLogger - Padrões

### ✅ Padrão 1: Logar Erro em Service
```typescript
// services/productService.ts
import { frontendLogger } from '@/monitoring';
import { httpClient } from '@/lib/http-client';

export async function fetchProducts(page: number = 1) {
  try {
    const result = await httpClient.get<Product[]>(
      `/products?page=${page}`
    );

    if (!result.ok) {
      // Erro já foi logado pelo httpClient
      // Mas você pode adicionar mais contexto se necessário
      frontendLogger.warn({
        message: 'Falha ao buscar produtos',
        context: {
          page,
          errorCode: result.error.code,
          status: result.error.status,
        },
      });

      throw new AppError(
        result.error.message,
        result.error.code as ErrorCode
      );
    }

    return result.data;
  } catch (error) {
    frontendLogger.error({
      message: 'Erro crítico ao buscar produtos',
      error: error as Error,
      context: { page },
    });

    throw error;
  }
}
```

### ✅ Padrão 2: Logar Ação Crítica
```typescript
// hooks/useDeleteProduct.ts
import { frontendLogger } from '@/monitoring';
import { httpClient } from '@/lib/http-client';

export function useDeleteProduct() {
  const { execute, loading, error } = useAsyncAction(
    async (productId: string) => {
      frontendLogger.logCriticalAction({
        action: 'delete',
        status: 'start',
        context: { productId },
      });

      const result = await httpClient.delete(`/products/${productId}`);

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      frontendLogger.logCriticalAction({
        action: 'delete',
        status: 'success',
        context: { productId },
      });

      return { productId };
    },
    {
      onError: (error) => {
        frontendLogger.logCriticalAction({
          action: 'delete',
          status: 'error',
          error,
          context: { errorCode: error.code },
        });
      },
    }
  );

  return { deleteProduct: execute, loading, error };
}
```

### ✅ Padrão 3: RequestId para Rastreamento
```typescript
// hooks/useBulkOperation.ts
import { frontendLogger } from '@/monitoring';
import { generateRequestId } from '@/utils/request-id';

export async function processBulkDelete(productIds: string[]) {
  const requestId = generateRequestId();

  return frontendLogger.withRequestId(requestId, async () => {
    frontendLogger.info({
      message: `Iniciando bulk delete de ${productIds.length} produtos`,
      context: { count: productIds.length },
    });

    const results = await Promise.allSettled(
      productIds.map((id) =>
        httpClient.delete(`/products/${id}`)
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    frontendLogger.info({
      message: `Bulk delete concluído`,
      context: { succeeded, failed, requestId },
    });

    return { succeeded, failed };
  });
}
```

---

## 4. Validação com Zod - Padrões

### ✅ Padrão 1: Form com Validação React Hook Form
```typescript
// components/ProductForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateProductSchema, type CreateProductPayload } from '@/schemas/validation';
import { httpClient } from '@/lib/http-client';

export function ProductForm() {
  const { register, handleSubmit, formState: { errors }, isSubmitting } = useForm<CreateProductPayload>({
    resolver: zodResolver(CreateProductSchema),
  });

  const onSubmit = async (payload: CreateProductPayload) => {
    const result = await httpClient.post<Product, CreateProductPayload>(
      '/products',
      payload
    );

    if (result.ok) {
      navigate(`/products/${result.data.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register('name')}
        placeholder="Nome"
      />
      {errors.name && <span>{errors.name.message}</span>}

      <input
        {...register('price', { valueAsNumber: true })}
        type="number"
        placeholder="Preço"
      />
      {errors.price && <span>{errors.price.message}</span>}

      <input
        {...register('stock', { valueAsNumber: true })}
        type="number"
        placeholder="Estoque"
      />
      {errors.stock && <span>{errors.stock.message}</span>}

      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Salvando...' : 'Criar'}
      </button>
    </form>
  );
}
```

### ✅ Padrão 2: Validação manual antes de request
```typescript
// services/bulkImportService.ts
import { validatePayload } from '@/schemas/validation';
import { CreateProductSchema, type CreateProductPayload } from '@/schemas/validation';

export async function importProducts(rows: unknown[]) {
  const validProducts: CreateProductPayload[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { valid, data, error: validationError } = validatePayload<CreateProductPayload>(
      CreateProductSchema,
      rows[i]
    );

    if (valid && data) {
      validProducts.push(data);
    } else {
      errors.push({
        row: i + 1,
        error: validationError || 'Validação falhou',
      });
    }
  }

  if (errors.length > 0) {
    frontendLogger.warn({
      message: `Import: ${validProducts.length} válidos, ${errors.length} inválidos`,
      context: { errors },
    });
  }

  // Enviar apenas produtos válidos
  const result = await httpClient.post<{ count: number }, CreateProductPayload[]>(
    '/products/bulk',
    validProducts
  );

  return { imported: result.ok ? result.data.count : 0, errors };
}
```

---

## 5. Performance Hooks - Padrões

### ✅ Padrão 1: Debounce em Busca
```typescript
// components/ProductSearch.tsx
import { useState } from 'react';
import { useDebouncedValue } from '@/hooks/usePerformance';

export function ProductSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);

  const [results, setResults] = useState<Product[]>([]);

  useEffect(() => {
    if (debouncedSearchTerm.length > 2) {
      httpClient
        .get<Product[]>(`/products/search?q=${encodeURIComponent(debouncedSearchTerm)}`)
        .then((result) => {
          if (result.ok) {
            setResults(result.data);
          }
        });
    } else {
      setResults([]);
    }
  }, [debouncedSearchTerm]);

  return (
    <div>
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Buscar produtos..."
      />
      <ul>
        {results.map((product) => (
          <li key={product.id}>{product.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### ✅ Padrão 2: Memo Profundo para Dados Complexos
```typescript
// components/ProductTable.tsx
import { useDeepMemo } from '@/hooks/usePerformance';

interface ProductTableProps {
  products: Product[];
  filters: FilterCriteria;
}

export function ProductTable({ products, filters }: ProductTableProps) {
  // Memo profundo para evitar re-cálculo
  const filteredAndSorted = useDeepMemo(() => {
    return products
      .filter((p) => {
        if (filters.category && p.category !== filters.category) return false;
        if (filters.minPrice && p.price < filters.minPrice) return false;
        if (filters.maxPrice && p.price > filters.maxPrice) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, filters]);

  return (
    <table>
      <tbody>
        {filteredAndSorted.map((product) => (
          <tr key={product.id}>
            <td>{product.name}</td>
            <td>${product.price}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### ✅ Padrão 3: LocalStorage com useLocalStorage
```typescript
// hooks/useUserPreferences.ts
import { useLocalStorage } from '@/hooks/usePerformance';

interface UserPreferences {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  itemsPerPage: number;
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useLocalStorage<UserPreferences>(
    'userPreferences',
    {
      theme: 'dark',
      sidebarCollapsed: false,
      itemsPerPage: 20,
    }
  );

  return {
    preferences,
    setTheme: (theme) =>
      setPreferences((prev) => ({ ...prev, theme })),
    toggleSidebar: () =>
      setPreferences((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed })),
    setItemsPerPage: (count) =>
      setPreferences((prev) => ({ ...prev, itemsPerPage: count })),
  };
}
```

---

## 6. Protected Routes - Padrões

### ✅ Padrão 1: Protected Page
```typescript
// pages/AdminDashboard.tsx
import { useProtectedRoute } from '@/hooks/useProtectedRoute';

export default function AdminDashboard() {
  const { isAuthorized, isLoading } = useProtectedRoute({
    requireAuth: true,
    allowedRoles: ['admin'],
    redirectTo: '/login',
    onForbidden: () => {
      frontendLogger.warn({
        message: 'Acesso negado: privilégios insuficientes',
      });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthorized) {
    return null; // Redirecionado automaticamente
  }

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {/* conteúdo */}
    </div>
  );
}
```

### ✅ Padrão 2: HOC com Protected Route
```typescript
// pages/ReportsPage.tsx
import { withProtectedRoute } from '@/hooks/useProtectedRoute';

const ReportsPageContent = () => {
  return (
    <div>
      <h1>Relatórios</h1>
      {/* conteúdo */}
    </div>
  );
};

export const ReportsPage = withProtectedRoute(ReportsPageContent, {
  requireAuth: true,
  allowedRoles: ['admin', 'manager'],
});

// Router
<Route path="/reports" element={<ReportsPage />} />
```

### ✅ Padrão 3: Verificação de Permissão em Componente
```typescript
// components/DeleteButton.tsx
import { useAuthStore } from '@/store/auth'; // seu store

export function DeleteButton({ itemId }: { itemId: string }) {
  const user = useAuthStore((s) => s.user);
  const canDelete = user?.roles.includes('admin') || user?.permissions.includes('delete_items');

  if (!canDelete) {
    return <button disabled>Deletar (sem permissão)</button>;
  }

  return (
    <button onClick={() => handleDelete(itemId)}>
      Deletar
    </button>
  );
}
```

---

## 7. Async Actions - Padrões

### ✅ Padrão 1: Form Submission
```typescript
// components/SettingsForm.tsx
import { useAsyncAction } from '@/hooks/useAsyncAction';

export function SettingsForm() {
  const { execute: saveSettings, loading, error } = useAsyncAction(
    async (settings: SettingsPayload) => {
      const result = await httpClient.put<Settings, SettingsPayload>(
        '/settings',
        settings
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    {
      onSuccess: (settings) => {
        frontendLogger.logCriticalAction({
          action: 'submit',
          status: 'success',
          context: { settingCount: Object.keys(settings).length },
        });

        showSuccess('Configurações salvas!');
      },
      onError: (error) => {
        showError(`Falha ao salvar: ${error.message}`);
      },
    }
  );

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await saveSettings(Object.fromEntries(formData));
    }}>
      {/* campos */}
      <button disabled={loading} type="submit">
        {loading ? 'Salvando...' : 'Salvar'}
      </button>
      {error && <p className="error">{error.message}</p>}
    </form>
  );
}
```

### ✅ Padrão 2: Com Retry Automático
```typescript
// hooks/useDataFetch.ts
import { useAsyncAction } from '@/hooks/useAsyncAction';

export function useDataFetch<T>(
  fetchFn: () => Promise<T>,
  options: { onSuccess?: (data: T) => void } = {}
) {
  return useAsyncAction(fetchFn, {
    autoRetry: true,
    maxRetries: 3, // Retry até 3 vezes
    onSuccess: options.onSuccess,
    onError: (error) => {
      frontendLogger.error({
        message: 'Falha após 3 tentativas',
        error,
      });
    },
  });
}
```

---

## 8. Integração Completa - Exemplo Real

### ✅ Exemplo: Página de Produtos com Todo Padrão

```typescript
// pages/ProductsPage.tsx
import { useState, useEffect } from 'react';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useProtectedRoute } from '@/hooks/useProtectedRoute';
import { useDebouncedValue, useDeepMemo } from '@/hooks/usePerformance';
import { httpClient } from '@/lib/http-client';
import { frontendLogger } from '@/monitoring';
import { validatePayload, SearchQuerySchema } from '@/schemas/validation';
import type { Product } from '@/types';

interface ProductsPageState {
  searchTerm: string;
  category: string;
  page: number;
}

export default function ProductsPage() {
  // Proteção de rota
  useProtectedRoute({
    requireAuth: true,
    allowedRoles: ['user', 'admin'],
  });

  // Estado
  const [state, setState] = useState<ProductsPageState>({
    searchTerm: '',
    category: '',
    page: 1,
  });

  // Debounce para busca
  const debouncedSearch = useDebouncedValue(state.searchTerm, 500);

  // Async action com retry
  const {
    data: products,
    loading,
    error,
    execute: fetchProducts,
  } = useAsyncAction(
    async () => {
      // Validar search params
      const { valid, data: queryParams } = validatePayload(SearchQuerySchema, {
        q: debouncedSearch,
        page: state.page,
        limit: 20,
      });

      if (!valid) {
        throw new Error('Parâmetros inválidos');
      }

      const params = new URLSearchParams(queryParams as any);
      const result = await httpClient.get<Product[]>(`/products?${params}`);

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      frontendLogger.logCriticalAction({
        action: 'fetch',
        status: 'success',
        context: {
          q: debouncedSearch,
          count: result.data.length,
          page: state.page,
        },
      });

      return result.data;
    },
    {
      autoRetry: true,
      maxRetries: 2,
      onError: (error) => {
        frontendLogger.error({
          message: 'Falha ao buscar produtos',
          error,
          context: { searchTerm: debouncedSearch },
        });
      },
    }
  );

  // Fetch quando search muda
  useEffect(() => {
    fetchProducts();
  }, [debouncedSearch, state.page, fetchProducts]);

  // Memo profundo para evitar re-renders
  const filteredProducts = useDeepMemo(() => {
    if (!products) return [];

    return products.filter(
      (p) => !state.category || p.category === state.category
    );
  }, [products, state.category]);

  return (
    <div>
      <h1>Produtos</h1>

      {/* Search */}
      <input
        value={state.searchTerm}
        onChange={(e) =>
          setState((prev) => ({ ...prev, searchTerm: e.target.value, page: 1 }))
        }
        placeholder="Buscar..."
      />

      {/* Loading */}
      {loading && <p>Carregando...</p>}

      {/* Error */}
      {error && (
        <ErrorAlert
          error={error}
          onRetry={() => fetchProducts()}
        />
      )}

      {/* Results */}
      <div className="products-grid">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          disabled={state.page === 1}
          onClick={() =>
            setState((prev) => ({ ...prev, page: prev.page - 1 }))
          }
        >
          Anterior
        </button>
        <span>Página {state.page}</span>
        <button
          onClick={() =>
            setState((prev) => ({ ...prev, page: prev.page + 1 }))
          }
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
```

---

**Estes padrões cobrem 95% dos casos de uso frontend em produção.**

Adapte conforme necessário para seu contexto específico.
