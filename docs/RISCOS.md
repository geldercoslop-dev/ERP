# Mapeamento de Riscos e Pontos de Atenção

Este documento lista os pontos de risco identificados no código do ERP que precisam de atenção especial durante o desenvolvimento.

## Riscos de Segurança

### Autenticação e Autorização

- **TODO: [RISCO]** Implementação atual do bcrypt tem fallback para texto plano, o que é inseguro em produção
- **TODO: [RISCO]** Não há validação de CSRF nas requisições
- **TODO: [RISCO]** Não há rate limiting para tentativas de login
- **TODO: [RISCO]** Não há expiração de sessão configurada

### Validação de Dados

- ✅ **RESOLVIDO** ~~Muitos endpoints aceitam `any` como tipo de entrada, sem validação adequada~~ - Implementamos validação rigorosa com Zod nos endpoints críticos
- ✅ **RESOLVIDO** ~~Falta validação de dados de entrada em formulários críticos (pedidos, financeiro)~~ - Adicionamos validação detalhada nos endpoints de pedidos e produtos
- **TODO: [RISCO]** Sanitização de dados de entrada para evitar XSS não está implementada consistentemente

## Riscos de Performance

### Consultas ao Banco de Dados

- **TODO: [RISCO]** Algumas consultas não têm limites e podem retornar conjuntos muito grandes de dados
- **TODO: [RISCO]** Falta paginação em listagens que podem crescer (pedidos, produtos)
- **TODO: [RISCO]** Algumas consultas não usam índices adequados

### Renderização e Estado

- **TODO: [RISCO]** Componentes com re-renderizações desnecessárias (useEffect sem dependências corretas)
- **TODO: [RISCO]** Falta de memoização em cálculos pesados
- **TODO: [RISCO]** Componentes grandes que poderiam ser divididos para melhor performance

## Riscos de UX

### Feedback ao Usuário

- **TODO: [RISCO]** Falta feedback visual durante operações longas
- **TODO: [RISCO]** Mensagens de erro genéricas que não ajudam o usuário a resolver o problema
- **TODO: [RISCO]** Falta de validação em tempo real nos formulários

### Navegação e Usabilidade

- **TODO: [RISCO]** Fluxos de trabalho que exigem muitos cliques
- **TODO: [RISCO]** Falta de atalhos de teclado para operações comuns
- **TODO: [RISCO]** Inconsistência na navegação entre telas

## Riscos de Manutenção

### Código e Arquitetura

- **TODO: [RISCO]** Duplicação de lógica em vários componentes
- **TODO: [RISCO]** Falta de testes automatizados
- **TODO: [RISCO]** Componentes com muitas responsabilidades

### Documentação

- **TODO: [RISCO]** Falta de documentação sobre a arquitetura do sistema
- **TODO: [RISCO]** Falta de comentários em código complexo
- **TODO: [RISCO]** Falta de documentação sobre processos de negócio

## Riscos Específicos por Módulo

### Vendas e Pedidos

- ✅ **RESOLVIDO** ~~Cálculo de valores totais não considera arredondamentos adequados~~ - Implementamos utilitários de precisão financeira com arredondamento fixo de 2 casas decimais
- ✅ **RESOLVIDO** ~~Falta validação de estoque disponível~~ - Adicionamos verificação de estoque na rota de finalizar venda
- ✅ **RESOLVIDO** ~~Não há tratamento para conflitos de edição simultânea~~ - Implementamos verificação de versão para evitar sobrescritas concorrentes

### Financeiro

- ✅ **RESOLVIDO** ~~Cálculos financeiros sem validação adequada~~ - Implementamos utilitários de precisão financeira
- **TODO: [RISCO]** Falta de logs para operações críticas
- **TODO: [RISCO]** Não há conciliação automática

### Estoque

- **TODO: [RISCO]** Falta controle de lotes
- **TODO: [RISCO]** Não há alerta para estoque baixo
- ✅ **RESOLVIDO** ~~Movimentações de estoque sem rastreabilidade adequada~~ - Implementamos trava de estoque para evitar vendas sem estoque disponível

## Próximos Passos

1. Priorizar os riscos com base no impacto e probabilidade
2. Criar tarefas específicas para mitigar cada risco
3. Implementar testes automatizados para detectar regressões
4. Documentar decisões de arquitetura e processos de negócio