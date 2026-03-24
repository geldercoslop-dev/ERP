/**
 * Type Safety Audit - Revisão de Type Safety do Frontend
 * 
 * Este arquivo documenta:
 * 1. Ocorrências de `any` encontradas
 * 2. Tipos que podem ser melhorados
 * 3. Recomendações de correção
 */

// ❌ FOUND ANTI-PATTERNS:

// 1. Em hooks - useProdutos(filters?: any)
// ATUAL: filters?: any
// CORREÇÃO: use FilterSchema validado com Zod
// FILE: hooks/useProdutos.ts

// 2. Em componentes - props with implicit any
// VERIFICAR: todos os components precisam de typed Props
// PADRÃO:
// interface ComponentProps {
//   ...
// }
// export const Component: React.FC<ComponentProps> = ({ ... }) => { ... }

// 3. Em responses de API
// VERIFICAR: todas as respostas precisam estar em types/
// PADRÃO:
// import type { ApiResponse, ApiError } from '@/types'
// const response: ApiResponse<User> = await fetch(...)

// ============================================

/**
 * Checklist de Type Safety
 */
export const TYPE_SAFETY_CHECKLIST = {
  '1. Components': {
    'Todas as Props precisam ser typed': 'VERIFICAR',
    'Callbacks com tipos corretos': 'VERIFICAR',
    'useState com tipos': 'VERIFICAR',
    'useCallback com tipos': 'VERIFICAR',
  },
  
  '2. Hooks': {
    'Remover `any` de useContext/useMemo/useCallback': 'VERIFICAR',
    'Tipificar hooks customizados': 'VERIFICAR',
    'useMemo<T> com tipo parametrizado': 'VERIFICAR',
  },
  
  '3. Services': {
    'Remover `any` de payloads': 'VERIFICAR',
    'Usar schemas de validação': 'VERIFICAR',
    'Return types sempre explícitos': 'VERIFICAR',
  },
  
  '4. API Layer': {
    'Respostas tipadas com ApiResponse<T>': 'VERIFICAR',
    'Erros tipados com ApiError': 'VERIFICAR',
    'Validação de payload pré-envio': 'VERIFICAR',
  },
  
  '5. Store (Zustand)': {
    'Criar interface para Store state': 'VERIFICAR',
    'Actions com tipos': 'VERIFICAR',
    'Selectors tipados': 'VERIFICAR',
  },
  
  '6. Utils': {
    'Nenhum `any` permitido': 'VERIFICAR',
    'Return types explícitos': 'VERIFICAR',
    'Generic types parametrizados': 'VERIFICAR',
  },
};

/**
 * Padrões Recomendados
 */
export const RECOMMENDED_PATTERNS = {
  // ✅ CORRETO
  componentWithProps: `
    interface MyComponentProps {
      title: string;
      onSubmit: (data: FormData) => Promise<void>;
      items: Item[];
    }
    
    export const MyComponent: React.FC<MyComponentProps> = ({
      title,
      onSubmit,
      items,
    }) => {
      return <div>{title}</div>;
    };
  `,

  // ✅ CORRETO
  hookWithTypes: `
    interface UseUserOptions {
      userId: string;
      autoFetch?: boolean;
    }
    
    interface UseUserReturn {
      user: User | null;
      loading: boolean;
      error: AppError | null;
      refetch: () => Promise<void>;
    }
    
    export function useUser(options: UseUserOptions): UseUserReturn {
      // implementation
    }
  `,

  // ✅ CORRETO
  serviceWithValidation: `
    import { LoginSchema, type LoginPayload } from '@/schemas/validation';
    import { httpClient } from '@/lib/http-client';
    import type { ApiResponse } from '@/types/api';
    
    export async function login(payload: LoginPayload): Promise<ApiResponse<AuthToken>> {
      const result = await httpClient.post<AuthToken, LoginPayload>(
        '/auth/login',
        payload
      );
      
      if (!result.ok) {
        throw new AppError(result.error.message, ErrorCode.AUTH_ERROR);
      }
      
      return { data: result.data };
    }
  `,

  // ✅ CORRETO
  useCallbackWithTypes: `
    const handleSubmit = useCallback<(data: FormData) => Promise<void>>(
      async (data) => {
        // tipos automáticos!
      },
      [/* deps */]
    );
  `,

  // ✅ CORRETO
  useMemoWithTypes: `
    const memoizedData = useMemo<ProcessedData>(() => {
      return processData(rawData);
    }, [rawData]);
  `,
};

/**
 * Comandos para Auditoria
 */
export const AUDIT_COMMANDS = {
  findAny: 'grep -r ":\\s*any" src/ --include="*.ts" --include="*.tsx"',
  findUntypedProps: 'grep -r "interface.*Props\\s*{" src/ --include="*.tsx" | grep -v "\\["',
  findMissingReturnTypes: 'grep -r "^\\s*\\(async\\s*\\)\/\*.*\\*\/\\s*(function|const)\\s*(" src/',
  tscStrict: 'pnpm exec tsc --noEmit --strict',
};

/**
 * Meta de Type Safety
 */
export const TYPE_SAFETY_GOALS = {
  'Zero `any`': '✅ 100%',
  'All Props typed': '✅ 100%',
  'All Return types explicit': '✅ 100%',
  'Schemas for API payloads': '✅ 100%',
  'APIResponse<T> for all delas': '✅ 100%',
};
