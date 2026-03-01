# GRS MÓVEIS — Changelog

## v2026.02.21 — Faxina Técnica Completa

### 🔴 Bugs Críticos Corrigidos

- **Login incompatível (frontend ≠ backend)**: `server/routers.ts` agora aceita `username/password` em vez de `usuario/senha`
- **Retorno do login achatado**: a mutation de login retorna `{ ok, sessionToken, openId, name, role }` diretamente na raiz
- **Verificação pós-login**: `Login.tsx` usa `if (me.data)` em vez de `me.data?.ok` (campo inexistente)
- **Rota /vendas**: `App.tsx` agora renderiza `<Vendas />` corretamente (antes renderizava `<Home />`)
- **Cookie rejeitado silenciosamente em dev**: `cookies.ts` usa `SameSite: 'lax'` em HTTP local e `SameSite: 'none' + Secure: true` em produção HTTPS
- **ErrorBoundary não estava no root**: `main.tsx` agora envolve toda a árvore com `<ErrorBoundary>`
- **Redirect de autenticação estava comentado**: handler de 401 reativado em `main.tsx`
- **document.cookie inseguro**: linha removida de `Login.tsx` — cookie httpOnly do backend é suficiente

### 🟠 Problemas de Alto Impacto Resolvidos

- **useAuth: enabled:!localUser removido** — `meQuery` agora sempre roda para validar sessão real no backend
- **useAuth: window.location.href substituído** por `setLocation` do wouter (navegação SPA sem hard refresh)
- **QueryClient: defaultOptions configurados** — `retry: false`, `staleTime: 30_000` (evita 3 retentativas em 401)
- **useAuthSimple e useAuthIsolated removidos** — hooks paralelos obsoletos eliminados
- **NovaVenda, MeusPedidos, Perfil**: todos migrados para `useAuth` oficial
- **Mutations Clientes**: `onError` + `onSettled` adicionados
- **Mutations Produtos**: `onError` + `onSettled` adicionados
- **Mutations Vendedores**: `onSettled` adicionado
- **Busca global**: campo marcado como disabled com placeholder honesto (em desenvolvimento)

### 🟡 Melhorias de Qualidade

- **Funções de máscara centralizadas**: `lib/masks.ts` agora exporta `maskCpf`, `maskCep`, `maskMoney`, `parseMoney`
- **Duplicatas removidas**: `onlyDigits` e `maskTelefone` removidas de `Vendedores.tsx`; `maskCpf`/`maskCep` removidas de `Clientes.tsx`; `maskPhone`/`maskMoney`/`parseMoney` removidas de `NovaVenda.tsx`
- **APP_VERSION centralizado**: `client/src/const.ts` — sem strings hardcoded espalhadas
- **menuConfig declarativo**: `client/src/config/menuConfig.ts` — todas as 17 rotas com roles por item
- **AppShell refatorado**: usa `menuConfig`, grupos colapsáveis, ESC fecha drawer mobile, sem itens hardcoded
- **Controle de acesso por role**: `AdminRoute` em `App.tsx` protege rotas admin contra acesso direto por URL
- **handleTrpcError centralizado**: `client/src/lib/trpcErrorHandler.ts`
- **boletoPrimeiroVenc**: inicializado com função lazy `useState(() => ...)` para evitar recálculo por render
- **localUser memoizado**: `useAuth` usa `useMemo` para leitura do localStorage
- **Perfil.tsx**: reescrito com dark theme consistente e `useAuth` oficial

### 🗑️ Arquivos Removidos (obsoletos)

- `client/src/pages/Home_ANTIGO.tsx`
- `client/src/pages/Home_BACKUP.tsx`
- `client/src/pages/LoginIsolated.tsx`
- `client/src/pages/LoginSimple.tsx`
- `client/src/pages/LoginSimples.tsx`
- `client/src/pages/Backup.tsx`
- `client/src/_core/hooks/useAuthSimple.ts`
- `client/src/_core/hooks/useAuthIsolated.ts`
- `client/src/components/DiagnosticOverlay.tsx`
- `server/routers_backup.ts`
- Múltiplos arquivos .md redundantes na raiz

### 📁 Arquivos Movidos para `_legacy/`

- `VendasForm.tsx`, `VendasFormSimple.tsx`, `ComponentShowcase.tsx`, `AIChatBox.tsx`, `ManusDialog.tsx`

### ✅ Novos Arquivos Criados

- `client/src/config/menuConfig.ts` — configuração declarativa do menu com roles
- `client/src/lib/trpcErrorHandler.ts` — handler centralizado de erros tRPC
