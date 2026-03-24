# DIAGNÓSTICO FINAL TYPESCRIPT

## RESUMO GERAL
- **Total de erros**: 768
- **Arquivos com erros**: 130

## ERROS POR PASTA

### SERVER (762 erros)
Principal fonte de problemas, concentrado em:
- Core system (routers, _core, leo modules)
- Services e infraestrutura
- Queue e monitoring

### CLIENT (6 erros) 
Erros mínimos, principalmente em retry client

## TOP 10 ARQUIVOS COM MAIS ERROS

1. **server/routers.ts** (62 erros)
   - Tipo: Argumentos incompatíveis em contextos
   - Propriedades ausentes em objetos de retorno

2. **server/leo/tasks/leo-task-queue.ts** (40 erros)
   - Tipo: Imports não encontrados, exports incorretos
   - Problemas com insertLeoActionLog vs NewLeoActionLog

3. **server/leo/security/leo-hardening.ts** (30 erros)
   - Tipo: Módulos não encontrados (logger, db paths)
   - Propriedades incorretas em objetos

4. **server/routers/logistica.ts** (23 erros)
   - Tipo: Imports não encontrados (trpc)
   - Parâmetros com tipo 'any'

5. **server/queue/queue.ts** (21 erros)
   - Tipo: BullMQ exports não encontrados
   - QueueOptions, Worker, WorkerOptions ausentes

6. **server/leo/memory/leo-semantic-memory.ts** (21 erros)
   - Tipo: Módulos não encontrados (logger)
   - Re-declaração de variáveis

7. **server/leo/planning/leo-daily-report.ts** (19 erros)
   - Tipo: Imports de módulos internos não encontrados

8. **server/routers/produtos.ts** (19 erros)
   - Tipo: Imports não encontrados (trpc, api-response)
   - Parâmetros com tipo 'any'

9. **server/routers/leo-admin-dashboard.ts** (19 erros)
   - Tipo: Imports não encontrados (trpc)
   - Propriedades ausentes em objetos

10. **server/services/ai/app-discovery.service.ts** (18 erros)
    - Tipo: Possibly undefined em propriedades

## PADRÕES DE ERROS IDENTIFICADOS

### 1. IMPORTS INCORRETOS (40% dos erros)
- Módulos não encontrados em paths relativos
- Exports renomeados/inexistentes
- BullMQ API changes

### 2. TIPOS 'ANY' IMPLÍCITOS (25% dos erros)
- Parâmetros sem tipagem explícita
- Context objects não tipados

### 3. PROPRIEDADES AUSENTES (20% dos erros)
- Objetos de retorno com estrutura diferente
- Interfaces não atualizadas

### 4. INCOMPATIBILIDADE DE TIPOS (15% dos erros)
- Argumentos incompatíveis
- Genéricos incorretos

## RECOMENDAÇÃO DE CORREÇÃO

### BLOCO 1 - CRÍTICO (Prioridade Alta)
1. Corrigir imports de módulos principais
2. Ajustar exports do db/index.ts
3. Resolver BullMQ types

### BLOCO 2 - CONTEXTOS (Prioridade Média)
1. Padronizar tipos de contexto
2. Corrigir parâmetros 'any'
3. Ajustar interfaces de retorno

### BLOCO 3 - VALIDAÇÃO (Prioridade Baixa)
1. Corrigir possibly undefined
2. Ajustar validações de tipos
3. Limpeza de código morto
