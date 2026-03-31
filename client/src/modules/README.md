# 📦 MODULES — Preparação de Estrutura Futura

## Objetivo

Estrutura preparatória para organização modular do cliente sem alterar código existente.

## 🏗️ Estrutura

```
client/src/modules/
├── clientes/
│   ├── index.ts          (exports)
│   ├── types.ts          (tipos específicos do domínio)
│   └── hooks.ts          (hooks futuros — placeholder)
│
├── pedidos/
│   ├── index.ts          (exports)
│   ├── types.ts          (tipos específicos do domínio)
│   └── hooks.ts          (hooks futuros — placeholder)
│
└── financeiro/
    ├── index.ts          (exports)
    ├── types.ts          (tipos específicos do domínio)
    └── hooks.ts          (hooks futuros — placeholder)
```

## 🔒 Regras

✅ **PODE**:
- Adicionar tipos base em `shared/types/payloads-*.ts`
- Criar estrutura de pastas e arquivos placeholder
- Adicionar comentários explicando uso futuro
- Preparar escalabilidade

❌ **NÃO PODE**:
- Integrar com backend atual
- Chamar `trpcCall` ou `fetch`
- Alterar routers/services existentes
- Criar lógica de negócio
- Modificar código em produção

## 📝 Como Usar (Futuro)

### Passo 1: Implementar Hooks

```typescript
// client/src/modules/clientes/hooks.ts
export function useClienteList(params: ClienteListParams) {
  return useQuery({
    queryKey: ['clientes', params],
    queryFn: () => trpcCall('clientes.list', params),
  });
}
```

### Passo 2: Componentes

```typescript
// client/src/modules/clientes/components/ClienteList.tsx
export function ClienteList() {
  const { data } = useClienteList({ page: 1 });
  return <div>{/* render */}</div>;
}
```

### Passo 3: Exportar

```typescript
// client/src/modules/clientes/index.ts
export * from './hooks';
export * from './components';
export type * from './types';
```

## 🎯 Próximas Fases

1. **Fase 2**: Implementar hooks reais
2. **Fase 3**: Criar componentes
3. **Fase 4**: Integrar com backend
4. **Fase 5**: Remover _legacy

---

**Status**: 🔄 PREPARAÇÃO FASE 1 ✅ CONCLUÍDO

**Segurança**: 🔒 ZERO INTERFERÊNCIA com código existente
