# LEO EXECUTION CORE - IMUTÁVEL

## ⚠️ AVISO CRÍTICO

Este diretório contém o **CORE DE EXECUÇÃO DO LEO**, que é **IMUTÁVEL** por design.

### Arquivos IMUTÁVEIS

- `execution-gate.ts` - ÚNICO ponto de execução do sistema
- `execution-registry.ts` - Registro obrigatório de toda execução
- `execution-contract-layer.ts` - Validação de origem de execução

### PRINCÍPIO FUNDAMENTAL

**CORE do LEO é IMUTÁVEL**
**FEATURES do sistema continuam EVOLUTIVAS**

A segurança da execução não pode impedir a evolução do produto.

---

## O QUE É CORE (IMUTÁVEL)

### Componentes Protegidos

1. **ExecutionGate** (`execution-gate.ts`)
   - ÚNICO ponto de execução do sistema
   - Validação de tenant
   - Verificação de permissões
   - Controle de approval
   - Execução via tools

2. **ExecutionRegistry** (`execution-registry.ts`)
   - Registro obrigatório de toda execução
   - Rastreabilidade completa
   - Audit trail

3. **ExecutionContractLayer** (`execution-contract-layer.ts`)
   - Validação de origem de execução
   - Bloqueio de bypass
   - Controle de entrypoints

4. **Scheduler Trigger** (em `leo-scheduler.ts`)
   - APENAS trigger de execução
   - NÃO contém lógica de negócio
   - Sempre chama ExecutionGate

5. **Actor Validation**
   - Validação de userId
   - Validação de userRole
   - Validação de vendedorId

6. **Tenant Validation**
   - Validação de tenantId
   - Consistência de contexto
   - Isolamento multi-tenant

---

## O QUE É EVOLUÇÃO (LIBERADO)

### Componentes Evolutivos

1. **Dashboards**
   - UI de visualização
   - Gráficos e métricas
   - Painéis de controle
   - RELACIONADO: APENAS consome dados, não altera execução

2. **Analytics UI**
   - Interfaces de análise
   - Relatórios visuais
   - Exportação de dados
   - RELACIONADO: APENAS lê dados, não altera execução

3. **Health Monitoring**
   - Monitoramento de sistema
   - Status de serviços
   - Alertas visuais
   - RELACIONADO: APENAS monitora, não altera execução

4. **Logging Visual**
   - Visualização de logs
   - Filtros e busca
   - Dashboards de logs
   - RELACIONADO: APENAS visualiza, não altera execução

5. **Performance Panels**
   - Métricas de performance
   - Gráficos de tempo
   - Análise de bottlenecks
   - RELACIONADO: APENAS monitora, não altera execução

6. **Reporting System**
   - Geração de relatórios
   - Exportação PDF/Excel
   - Agendamento de relatórios
   - RELACIONADO: APENAS gera relatórios via ExecutionGate

---

## REGRA DE OURO

### Para Features Novas

✅ **PERMITIDO:**
- Criar dashboards que consomem ExecutionGate
- Criar painéis de monitoramento
- Criar analytics de negócio
- Criar interfaces de relatórios
- Criar visualizações de logs
- Criar métricas de sistema

❌ **PROIBIDO:**
- Substituir ExecutionGate
- Duplicar lógica de execução
- Recriar scheduler fora do core
- Executar lógica direta sem registry
- Bypass de validação de tenant
- Bypass de validação de actor

---

## COMO EVOLUIR O SISTEMA

### Padrão Correto

```typescript
// ✅ CORRETO: Feature consome ExecutionGate
import { executeLeoActionGate } from '../runtime/execution-gate.js';

async function meuDashboardFeature(tenantId: number, userId: number) {
  const result = await executeLeoActionGate({
    action: 'minhaAcao',
    toolName: 'minhaTool',
    parameters: { tenantId },
    context: { tenantId, userId },
    source: 'dashboard',
  });
  return result;
}
```

```typescript
// ❌ ERRADO: Feature tenta substituir ExecutionGate
async function meuDashboardFeature(tenantId: number, userId: number) {
  // NUNCA fazer isso - bypass do core
  const service = new MeuService();
  return await service.executarDireto(tenantId);
}
```

---

## PROTEÇÃO LEVE

### Se Houver Tentativa de Alteração no Core

1. **WARNING Forte**
   - Emitir aviso no console
   - Exigir revisão manual
   - Documentar motivo da alteração

2. **NÃO Bloquear Build Automaticamente**
   - Permitir evolução
   - Exigir justificativa
   - Registrar alteração

### EXCEÇÃO: Bloqueio Automático

Só bloquear se houver:
- Bypass do ExecutionGate
- Execução direta fora do registry
- Remoção do scheduler trigger controlado
- Remoção de validação de tenant
- Remoção de validação de actor

---

## GARANTIA DE EVOLUÇÃO

### Permissões Livres

Você pode criar livremente:
- ✅ Dashboards de qualquer tipo
- ✅ Painéis de saúde do sistema
- ✅ Monitoramento de performance
- ✅ Analytics de negócio
- ✅ Logs visuais
- ✅ Métricas de sistema

**SEM tocar no core de execução.**

---

## CRITÉRIOS DE SUCESSO

- ✅ Execution Core está estável e reutilizável
- ✅ Sistema pode evoluir UI e features livremente
- ✅ Nenhum bypass de execução é possível
- ✅ Nenhuma feature precisa duplicar lógica do core
- ✅ Core não bloqueia evolução do produto

---

## CRITÉRIOS DE FALHA

- ❌ Core impedindo criação de dashboards
- ❌ Bloqueio de features não relacionadas à execução
- ❌ Duplicação de ExecutionGate em outros módulos
- ❌ Bypass de registry ou gate

---

## CONTATO

Se precisar alterar o core:
1. Documente o motivo
2. Justifique a necessidade
3. Prove que não quebra a segurança
4. Submeta para revisão

**O core é imutável por design, mas evolução é possível com justificativa.**
