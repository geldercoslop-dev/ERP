# Diretrizes de Desenvolvimento

Este documento estabelece as diretrizes e padrões a serem seguidos no desenvolvimento do ERP.

## Estrutura do Projeto

### Organização de Arquivos

- `client/src/pages/`: Componentes de página
- `client/src/components/`: Componentes reutilizáveis
- `client/src/hooks/`: Hooks customizados
- `client/src/store/`: Stores do Zustand
- `client/src/utils/`: Utilitários
- `client/src/lib/`: Bibliotecas e configurações
- `client/src/types/`: Tipos e interfaces
- `server/`: Código do servidor
- `drizzle/`: Schema do banco de dados

### Convenções de Nomenclatura

- **Arquivos de componentes**: PascalCase (ex: `Button.tsx`)
- **Arquivos de hooks**: camelCase (ex: `useAuth.tsx`)
- **Arquivos de utilitários**: camelCase (ex: `validation.ts`)
- **Arquivos de tipos**: camelCase (ex: `global.d.ts`)
- **Arquivos de stores**: camelCase (ex: `authStore.ts`)

## Padrões de Código

### TypeScript

- Evitar o uso de `any` sempre que possível
- Usar interfaces para definir tipos de props e estado
- Usar tipos do Drizzle para entidades do banco de dados
- Usar union types para valores enumerados (ex: `type Status = 'PENDENTE' | 'CONCLUIDO'`)
- Usar generics para componentes e funções reutilizáveis

### React

- Usar hooks para gerenciar estado e efeitos
- Usar componentes funcionais
- Usar memoização (`useMemo`, `useCallback`) para otimizar performance
- Evitar efeitos colaterais desnecessários
- Usar o padrão de componentes controlados para formulários

### Estado Global

- Usar Zustand para estado global
- Usar o padrão de stores separadas por domínio
- Usar o middleware `persist` para persistência
- Evitar duplicação de estado entre stores

### Estilo e CSS

- Usar Tailwind CSS para estilização
- Usar variáveis CSS para cores e espaçamento
- Usar componentes do Shadcn UI como base
- Manter consistência visual entre componentes

## Tratamento de Erros

### Erros de API

- Usar o cliente tRPC com tratamento de erros
- Mostrar mensagens de erro amigáveis para o usuário
- Logar erros detalhados no console
- Usar toast para feedback visual

### Erros de Formulário

- Validar dados de entrada antes de enviar
- Mostrar mensagens de erro específicas para cada campo
- Usar o utilitário `validation.ts` para validação
- Desabilitar botões de submit durante o envio

### Erros de Renderização

- Usar o componente `ErrorBoundary` para capturar erros de renderização
- Usar o componente `ErrorHandler` para tratamento global de erros
- Usar o utilitário `inDevelopment` para funções em desenvolvimento

## Comunicação com o Servidor

### tRPC

- Usar o cliente tRPC com tratamento de erros
- Usar o utilitário `cacheUtils` para gerenciar o cache
- Configurar staleTime e cacheTime adequados
- Usar invalidação de queries para manter dados atualizados

### Autenticação

- Usar o hook `useAuth` para gerenciar autenticação
- Usar o store `authStore` para estado de autenticação
- Usar o componente `AuthInitializer` para inicializar autenticação
- Verificar autenticação em rotas protegidas

## Documentação

### Comentários

- Usar JSDoc para documentar funções e componentes
- Comentar código complexo
- Usar `// TODO: [RISCO]` para marcar pontos de risco
- Manter o arquivo `RISCOS.md` atualizado

### README

- Manter o README atualizado com instruções de instalação e uso
- Documentar decisões de arquitetura
- Documentar processos de negócio
- Documentar dependências e requisitos

## Testes

### Testes Unitários

- Testar funções puras
- Testar hooks customizados
- Testar componentes isolados
- Usar mocks para dependências externas

### Testes de Integração

- Testar fluxos de trabalho completos
- Testar interação entre componentes
- Testar comunicação com o servidor
- Testar autenticação e autorização

## Workflow de Desenvolvimento

### Antes de Commitar

- Verificar se o código segue as diretrizes
- Verificar se não há erros de tipagem
- Verificar se não há erros de lint
- Verificar se não há erros de build

### Após Implementar uma Feature

- Documentar a feature
- Atualizar o arquivo `RISCOS.md` se necessário
- Atualizar o README se necessário
- Atualizar os testes se necessário