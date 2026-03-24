# LEO - Operador Total do Sistema

## Visão Geral

O LEO evoluiu de um assistente de IA para um operador completo do sistema, capaz de controlar não apenas o ERP mas também o computador inteiro, executar automações e monitorar a saúde do sistema de forma autônoma.

## Arquitetura Implementada

### Estrutura de Diretórios

```
server/leo/
├── index.ts                    # Export central de todos os módulos
├── leo-engine.ts              # Motor central de decisão
├── leo-context.ts             # Construção de contexto do sistema
├── leo-actions.ts             # Execução de ações do Leo
├── leo-permissions.ts         # Sistema de permissões
├── leo-computer-control.ts    # Controle de scripts e comandos
├── leo-desktop-control.ts     # Controle de mouse e teclado
├── leo-screen.ts              # Captura de tela
├── leo-ocr.ts                 # OCR para leitura de tela
├── leo-events.ts              # Sistema de eventos
├── leo-system-monitor.ts      # Monitoramento do sistema
└── leo-automation.ts          # Sistema de automação

server/services/
└── leo-service.ts             # Integração com ERP

drizzle/schema.ts              # Tabelas: leo_events, leo_tasks
```

## Módulos Criados

### FASE 1 - Núcleo do Leo ✅

**Arquivos:**
- `leo-engine.ts` - Motor central que processa comandos e decide ações
- `leo-context.ts` - Constrói contexto com estado do ERP, usuário e sistema
- `leo-actions.ts` - Executa ações de consulta, operação e sistema
- `leo-permissions.ts` - Gerencia permissões por nível (consulta, operação_erp, operacao_sistema, admin)

**Funcionalidades:**
- Interpretação de comandos em linguagem natural
- Análise de contexto para tomada de decisão
- Sistema de permissões granular
- Registro completo de todas as ações

### FASE 2 - Integração com ERP ✅

**Arquivo:**
- `server/services/leo-service.ts` - Serviço completo de integração

**Funcionalidades:**
- Consultas avançadas (pedidos, clientes, estoque, financeiro)
- Operações ERP (criar/editar/cancelar pedidos, ajustar estoque)
- Validação de dados e regras de negócio
- Auditoria completa das operações

### FASE 3 - Execução de Scripts ✅

**Arquivo:**
- `leo-computer-control.ts` - Controle de scripts do sistema

**Funcionalidades:**
- Execução de scripts .bat, .js, .ts, .py, .sh, .ps1
- Controle de processos (iniciar, parar, monitorar)
- Scripts mapeados: iniciar_dev, testar_saude, backup_db, commit_push
- Registro de execução com logs detalhados

### FASE 4 - Controle de Mouse e Teclado ✅

**Arquivo:**
- `leo-desktop-control.ts` - Automação de desktop

**Funcionalidades:**
- Movimentação precisa do mouse
- Cliques (simples, duplo, direito)
- Digitação de texto
- Atalhos de teclado (Ctrl+C, Ctrl+V, etc.)
- Scroll e arrastar
- Suporte para múltiplos monitores

**Dependência:** `robotjs`

### FASE 5 - Captura de Tela ✅

**Arquivo:**
- `leo-screen.ts` - Sistema de captura de tela

**Funcionalidades:**
- Captura de tela completa
- Suporte a múltiplos monitores
- Formatos PNG/JPG
- Gerenciamento automático de screenshots
- Limpeza de arquivos antigos

**Dependência:** `screenshot-desktop`

### FASE 6 - OCR - Leitura de Tela ✅

**Arquivo:**
- `leo-ocr.ts` - Reconhecimento óptico de caracteres

**Funcionalidades:**
- Extração de texto de imagens
- Busca de texto específico
- Extração de dados estruturados (emails, telefones, datas, valores)
- Suporte a múltiplos idiomas
- Posicionamento de texto (bbox)

**Dependência:** `tesseract.js`

### FASE 7 - Sistema de Eventos ✅

**Arquivo:**
- `leo-events.ts` - Gerenciamento de eventos do sistema

**Funcionalidades:**
- Registro de eventos (estoque baixo, pedido atrasado, erro sistema)
- Priorização (baixa, média, alta, crítica)
- Gerenciamento de status (aberto, em_andamento, resolvido, ignorado)
- Geração automática de eventos
- Estatísticas e relatórios

**Tabela:** `leo_events`

### FASE 8 - Monitoramento do Sistema ✅

**Arquivo:**
- `leo-system-monitor.ts` - Monitoramento contínuo

**Funcionalidades:**
- Verificação de saúde do servidor
- Monitoramento de banco de dados
- Análise de uso de CPU, memória e disco
- Detecção de anomalias
- Geração automática de alertas
- Relatórios de saúde do sistema

### FASE 9 - Sistema de Automação ✅

**Arquivo:**
- `leo-automation.ts` - Automação de tarefas

**Funcionalidades:**
- Agendamento de tarefas
- Recorrência (horária, diária, semanal, mensal)
- Tarefas predefinidas (backup, checagem estoque, análise vendas)
- Execução de scripts personalizados
- Fila de execução e gerenciamento de recursos

**Tabela:** `leo_tasks`

### FASE 10 - Log Completo de Ações ✅

**Funcionalidades:**
- Registro detalhado em `leo_actions_log`
- Rastreamento de comandos, ações e resultados
- Tempo de execução e performance
- Logs estruturados para análise

## Capacidades do LEO

### 1. Operador do ERP
- ✅ Consultar pedidos, clientes, estoque, financeiro
- ✅ Criar, editar, cancelar pedidos
- ✅ Ajustar estoque automaticamente
- ✅ Gerar relatórios e análises

### 2. Assistente Operacional
- ✅ Executar scripts do sistema
- ✅ Abrir programas e arquivos
- ✅ Controlar mouse e teclado
- ✅ Capturar e analisar telas

### 3. Monitor do Sistema
- ✅ Verificar saúde do servidor
- ✅ Monitorar banco de dados
- ✅ Detectar anomalias e gerar alertas
- ✅ Analisar logs de erro

### 4. Orquestrador do Ambiente
- ✅ Executar automações programadas
- ✅ Gerenciar eventos do sistema
- ✅ Otimizar recursos
- ✅ Manter sistema operacional

## Tabelas do Banco de Dados

### leo_events
```sql
CREATE TABLE leo_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(64) NOT NULL,
  descricao TEXT NOT NULL,
  prioridade ENUM('baixa', 'media', 'alta', 'critica') DEFAULT 'media',
  status ENUM('aberto', 'em_andamento', 'resolvido', 'ignorado') DEFAULT 'aberto',
  dados TEXT,
  usuarioCriador VARCHAR(128),
  usuarioResponsavel VARCHAR(128),
  dataCriacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dataResolucao TIMESTAMP NULL,
  resumoResolucao TEXT NULL
);
```

### leo_tasks
```sql
CREATE TABLE leo_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  descricao TEXT NOT NULL,
  acao VARCHAR(128) NOT NULL,
  agendamento TIMESTAMP NULL,
  status ENUM('pendente', 'executando', 'concluida', 'falha', 'cancelada') DEFAULT 'pendente',
  dados TEXT,
  resultado TEXT,
  usuarioCriador VARCHAR(128),
  dataCriacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dataExecucao TIMESTAMP NULL,
  proximaExecucao TIMESTAMP NULL,
  recorrencia VARCHAR(64)
);
```

## Dependências Opcionais

Para funcionalidades avançadas, instalar:

```bash
npm install robotjs          # Controle de mouse e teclado
npm install screenshot-desktop # Captura de tela
npm install tesseract.js    # OCR para leitura de tela
```

Script de instalação disponível:
```bash
npx tsx server/scripts/install-leo-dependencies.ts
```

## Como Usar

### 1. Importar módulos

```typescript
import { 
  leoEngine, 
  leoErpService, 
  leoComputerControl,
  leoDesktopControl,
  leoScreen,
  leoOcr,
  leoEvents,
  leoSystemMonitor,
  leoAutomation 
} from '../server/leo';
```

### 2. Processar comandos

```typescript
const resultado = await leoEngine.processCommand({
  id: 'cmd-001',
  comando: 'verificar estoque baixo',
  usuario: 'admin',
  origem: 'text'
});
```

### 3. Operar ERP

```typescript
const pedidos = await leoErpService.getPedidos({ status: 'GERADO' });
const novoPedido = await leoErpService.criarPedido({
  clienteId: 1,
  vendedorId: 1,
  itens: [{ produtoId: 1, quantidade: 2 }]
});
```

### 4. Controlar computador

```typescript
// Executar script
await leoComputerControl.executarScriptSistema('backup_db');

// Controlar mouse
await leoDesktopControl.moverMouse(100, 200);
await leoDesktopControl.clicarMouse();

// Capturar tela
const screenshot = await leoScreen.capturarTela();

// Ler texto da tela
const texto = await leoOcr.extrairTextoImagem(screenshot.path);
```

### 5. Monitorar sistema

```typescript
// Iniciar monitoramento
await leoSystemMonitor.iniciarMonitoramento(60000); // 1 minuto

// Gerar relatório de saúde
const saude = await leoSystemMonitor.gerarRelatorioSaude();
```

### 6. Automação

```typescript
// Iniciar automação
await leoAutomation.iniciarAutomacao();

// Criar tarefa
await leoAutomation.criarTarefa({
  descricao: 'Backup diário',
  acao: 'backup_automatico',
  recorrencia: 'daily',
  agendamento: new Date(Date.now() + 24 * 60 * 60 * 1000) // Amanhã
});
```

## Exemplos de Uso Avançado

### Verificação automática de estoque
```typescript
// Evento gerado automaticamente
await leoEvents.registrarEvento({
  tipo: 'estoque_baixo',
  descricao: 'Produto X com apenas 3 unidades',
  prioridade: 'alta',
  dados: { produtoId: 123, estoqueAtual: 3 }
});

// Leo pode tomar ação automaticamente
await leoErpService.ajustarEstoque({
  produtoId: 123,
  quantidade: 50,
  tipo: 'ENTRADA',
  motivo: 'Reposição automática - estoque baixo'
});
```

### Automação de backup
```typescript
// Tarefa recorrente
await leoAutomation.criarTarefa({
  descricao: 'Backup automático do banco',
  acao: 'backup_automatico',
  recorrencia: 'daily',
  agendamento: new Date('2024-01-01T02:00:00') // 2 da manhã
});
```

### Monitoramento contínuo
```typescript
// Leo monitora e gera alertas
await leoSystemMonitor.iniciarMonitoramento();
// Verifica: CPU, memória, disco, banco, erros, etc.
```

## Limitações Atuais

1. **Frontend:** Central de Controle do Leo ainda não implementada (FASE 11)
2. **Modo Copiloto:** Sugestões inteligentes ainda não implementadas (FASE 12)
3. **Dependências:** Funcionalidades avançadas requerem instalação de bibliotecas adicionais
4. **Permissões:** Sistema de permissões básico implementado, pode ser expandido

## Próximas Evoluções

### FASE 11 - Central de Controle (Pendente)
- Interface web completa para controle do Leo
- Dashboard com status em tempo real
- Controle visual de automações
- Histórico de ações e eventos

### FASE 12 - Modo Copiloto (Pendente)
- Sugestões proativas baseadas em dados
- Análise preditiva
- Recomendações de otimização
- Aprendizado contínuo

## Considerações de Segurança

1. **Permissões:** Sistema granular de permissões implementado
2. **Logs:** Todas as ações são registradas em `leo_actions_log`
3. **Auditoria:** Operações críticas têm audit trail completo
4. **Isolamento:** Módulos isolados para minimizar impacto de falhas

## Performance

1. **Singletons:** Todos os módulos usam padrão singleton para otimização
2. **Cache:** Contexto e resultados são cacheados quando possível
3. **Assíncrono:** Operações I/O são não-bloqueantes
4. **Recursos:** Monitoramento ativo de uso de CPU e memória

## Conclusão

O LEO agora é um operador completo do sistema, capaz de:

- ✅ **Operar o ERP** completo com todas as funcionalidades
- ✅ **Executar scripts** e comandos do sistema
- ✅ **Controlar mouse e teclado** para automação de qualquer aplicação
- ✅ **Ver a tela** e ler texto através de OCR
- ✅ **Monitorar sistema** em tempo real
- ✅ **Automatizar tarefas** com agendamento e recorrência
- ✅ **Registrar ações** para auditoria completa
- ✅ **Gerenciar eventos** e alertas proativamente

A arquitetura é modular, extensível e preparada para evoluções futuras. O Leo transformou-se de um assistente passivo para um operador ativo e autônomo do sistema.

---

**Status:** ✅ **IMPLEMENTAÇÃO CONCLUÍDA** (Fases 1-10 completas)  
**Próximo:** Implementar Frontend (FASE 11) e Modo Copiloto (FASE 12)
