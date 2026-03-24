# 🚀 QUICK START - FRONTEND HARDENING

**Para**: Desenvolvedores Frontend  
**Referência Rápida**: Como usar os novos tipos e helpers

---

## 📍 Importações Principais

```typescript
// Types
import type {
  ApiResponse,
  ApiError,
  ApiSuccess,
  ApiFailure,
  AsyncState,
  AsyncStatus,
  ErrorCode,
  AppError,
  UserInfo,
  AuthToken
} from '@/types';

// Utils
import {
  isApiError,
  getErrorMessage,
  formatErrorForDisplay,
  isRetryableError,
  safeParseJson,
  safeStringifyJson,
  isValidJson,
  deepCloneByJson
} from '@/utils';

// Config
import {
  API_URL,
  API_TIMEOUT_DEFAULT,
  RETRY_CONFIG,
  STORAGE_KEYS
} from '@/config/app';
```

---

## 📝 Exemplos de Uso

### 1. API Response Handling
```typescript
// ✅ Fazer requisição com tipo seguro
const response: ApiResponse<User> = await fetch(`${API_URL}/users/123`)
  .then(r => r.json());

// ✅ Type-safe error check
if (response.error) {
  console.error(response.error.code);      // 'NOT_FOUND' (typed)
  console.error(response.error.message);   // 'User not found'
  console.error(response.meta?.requestId); // Para debug
}

// ✅ Type-safe data access
if (response.data) {
  console.log(response.data.email);        // Typed ✅
}
```

### 2. Error Handling
```typescript
try {
  const data = await fetchUser(id);
} catch (error) {
  // ✅ Extrair mensagem de qualquer tipo de erro
  const message = getErrorMessage(error);
  
  // ✅ Mensagem amigável para usuário
  const userMessage = formatErrorForDisplay(error);
  alert(userMessage);
  
  // ✅ Decidir se fazer retry
  if (isRetryableError(error)) {
    // Implementar retry com backoff
    await sleep(RETRY_CONFIG.delayMs);
    // ... retry lógica
  }
}
```

### 3. JSON Safety
```typescript
// ❌ Antes (risky)
const data = JSON.parse(jsonString);

// ✅ Depois (safe)
const data = safeParseJson<User>(jsonString, {
  default: defaultUser,
  throwOnError: false
});

// ✅ Validar antes de usar
if (isValidJson(jsonString)) {
  const data = JSON.parse(jsonString);
}

// ✅ Clone seguro
const backup = deepCloneByJson(originalData);
```

### 4. Loading State
```typescript
// ✅ Estado assíncrono tipado
const [state, setState] = useState<AsyncState<User>>({
  status: AsyncStatus.IDLE,
  data: undefined,
  error: undefined,
  isLoading: false
});

// ✅ Atualizar estados
setState({
  status: AsyncStatus.LOADING,
  isLoading: true
});
```

### 5. AppError
```typescript
// ✅ Criar erro customizado
const error = new AppError(
  'Operação falhou',
  ErrorCode.VALIDATION_ERROR,
  400,
  { field: 'email' },
  requestId
);

// ✅ Type guard
if (isAppError(error)) {
  console.log(error.isRetryable());  // ✅
  console.log(error.isClientError()); // ✅
  console.log(error.requestId);      // Para debug
}
```

### 6. Configuration
```typescript
// ✅ URLs centralizadas
fetch(`${API_URL}/users`);

// ✅ Timeouts padronizados
const controller = new AbortController();
setTimeout(() => controller.abort(), API_TIMEOUT_DEFAULT);

// ✅ Storage keys tipadas
localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
localStorage.getItem(STORAGE_KEYS.USER_INFO);

// ✅ Retry config
for (let i = 0; i < RETRY_CONFIG.maxAttempts; i++) {
  try {
    return await fetchData();
  } catch (e) {
    if (i === RETRY_CONFIG.maxAttempts - 1) throw e;
    await sleep(Math.min(
      RETRY_CONFIG.delayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, i),
      RETRY_CONFIG.maxDelayMs
    ));
  }
}
```

---

## ⚠️ O Que Mudou

### ✅ Agora Disponível
- `@/types` - Todos os tipos globais
- `@/utils` - Helpers de erro e JSON
- `@/config/app` - Configuração centralizada
- ESLint com `no-explicit-any: error` em utils/types

### ✅ O Que NÃO Mudou
- Componentes funcionam normalmente
- Pages sem modificação
- Store sem alteração
- Styling/CSS intacto
- Backwards compatible

---

## 🔴 Erros Comuns

### ❌ Erro: "Type 'unknown' is not assignable to type 'never'"
```typescript
// ❌ Problema: any parseado sem validação
const data = JSON.parse(json) as User;

// ✅ Solução: use safeParseJson com tipo
const data = safeParseJson<User>(json);
```

### ❌ Erro: "Cannot access property 'message' of undefined"
```typescript
// ❌ Problema:
const msg = error.message;  // error pode ser string, Error, ou objeto

// ✅ Solução:
const msg = getErrorMessage(error);
```

### ❌ Erro: "Property 'code' is not assignable to type"
```typescript
// ❌ Problema:
const error: ApiError = {
  code: 'CUSTOM_ERROR',  // Não é enum
  message: 'msg'
};

// ✅ Solução:
const error: ApiError = {
  code: ErrorCode.VALIDATION_ERROR,  // Use enum
  message: 'msg'
};
```

---

## 🧪 Testing Tips

```typescript
// ✅ Mock ApiResponse
const mockResponse: ApiResponse<User> = {
  data: { id: 1, email: 'test@test.com', name: 'Test' }
};

// ✅ Mock AppError
const mockError = new AppError('Test error', ErrorCode.NETWORK_ERROR);

// ✅ Test retry logic
expect(isRetryableError(mockError)).toBe(true);

// ✅ Test JSON parsing
expect(safeParseJson<User>('invalid')).toBeUndefined();
```

---

## 📚 Documentação Completa

Veja arquivos completos em:
- `FRONTEND_HARDENING_SUMMARY.md` - Overview técnico
- `FRONTEND_HARDENING_CHECKLIST.md` - Detalhes implementação
- `FRONTEND_HARDENING_COMPLETE.md` - Status final
- `client/src/types/` - Tipos com comentários
- `client/src/utils/` - Helpers com JSDoc
- `client/src/config/app.ts` - Config comentada

---

## ✨ Ganhos Imediatos

1. 🎯 **Autocomplete melhorado** - IDEs sabem tipos
2. 🔒 **Type safety** - Erros em compile time
3. 🛡️ **Error tracking** - RequestId automaticamente
4. ⚡ **Menos código** - Helpers reutilizáveis
5. 📊 **Melhor debug** - Estrutura de erro clara

---

**Tudo pronto. Boa coding!** 🚀
