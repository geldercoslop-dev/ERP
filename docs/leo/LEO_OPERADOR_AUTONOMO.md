# LEO - Operador Autônomo do Sistema

## Visão Geral

O LEO evoluiu de um assistente de IA para um **operador autônomo completo** do sistema, capaz de controlar não apenas o ERP mas todo o computador, executar automações inteligentes e monitorar a saúde do sistema de forma proativa.

## Status da Implementação

### ✅ Fases Concluídas (16 de 16)

1. **✅ FASE 1** - Instalação de bibliotecas de controle
2. **✅ FASE 2** - Implementação de controle do computador
3. **✅ FASE 3** - Controle de desktop e janelas
4. **✅ FASE 4** - Captura de tela
5. **✅ FASE 5** - OCR para leitura de tela
6. **✅ FASE 6** - Motor de decisão com capacidades
7. **✅ FASE 7** - Sistema de eventos
8. **✅ FASE 8** - Monitoramento do sistema
9. **✅ FASE 9** - Automação de tarefas
10. **✅ FASE 10** - Log completo de ações
11. **✅ FASE 11** - API de controle `/api/leo/execute`
12. **✅ FASE 12** - Modo operador `LEO_OPERATOR_MODE`
13. **✅ FASE 13** - Sistema de automação avançado
14. **✅ FASE 14** - Integração total com ERP
15. **✅ FASE 15** - Teste completo validado
16. **✅ FASE 16** - Documentação final

## Arquitetura Implementada

### Estrutura de Arquivos

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
├── leo-automation.ts          # Sistema de automação
└── leo-operator-mode.ts        # Modo operador autônomo

server/services/
└── leo-service.ts             # Integração completa com ERP

server/routers/
└── leo-operator.ts            # API REST para controle completo

server/scripts/
└── test-leo-operator.ts       # Teste completo de validação
```

### Bancos de Dados

```sql
-- Eventos do sistema
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

-- Tarefas de automação
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

## Capacidades do LEO

### 🖥️ Controle do Computador

**Mouse e Teclado:**
- ✅ Mover mouse para coordenadas específicas
- ✅ Cliques (esquerdo, direito, duplo)
- ✅ Rolar mouse
- ✅ Digitar texto
- ✅ Pressionar teclas individuais
- ✅ Pressionar combinações (Ctrl+C, Alt+Tab, etc.)

**Controle de Aplicações:**
- ✅ Abrir programas por nome ou caminho
- ✅ Fechar aplicações
- ✅ Focar janelas
- ✅ Minimizar/maximizar janelas
- ✅ Detectar janelas abertas

**Dependências:** `robotjs`

### 📸 Captura de Tela

**Funcionalidades:**
- ✅ Capturar tela completa
- ✅ Capturar área específica
- ✅ Suporte a múltiplos monitores
- ✅ Formatos PNG/JPG
- ✅ Gerenciamento automático de arquivos
- ✅ Limpeza de screenshots antigos

**Dependências:** `screenshot-desktop`

### 🔍 OCR de Tela

**Funcionalidades:**
- ✅ Ler texto da tela completa
- ✅ Ler texto de área específica
- ✅ Buscar texto específico na imagem
- ✅ Extrair dados estruturados (emails, telefones, datas, valores)
- ✅ Suporte a múltiplos idiomas
- ✅ Posicionamento preciso de texto (bounding boxes)

**Dependências:** `tesseract.js`

### 🤖 Motor de Decisão

**Capacidades Detectadas:**
- ✅ `computer_control` - Controle de mouse/teclado
- ✅ `screen_reading` - Captura de tela
- ✅ `ocr_analysis` - Análise de texto
- ✅ `system_monitor` - Monitoramento do sistema
- ✅ `erp_operations` - Operações ERP (sempre disponível)
- ✅ `automation` - Sistema de automação

**Funcionalidades:**
- ✅ Interpretação de comandos em linguagem natural
- ✅ Análise de contexto do sistema
- ✅ Decisão automática de ações
- ✅ Verificação de permissões

### 📋 Sistema de Eventos

**Tipos de Eventos:**
- ✅ `estoque_baixo` - Produtos com estoque crítico
- ✅ `pedido_atrasado` - Pedidos fora do prazo
- ✅ `erro_sistema` - Falhas no sistema
- ✅ `cliente_inativo` - Clientes sem atividade
- ✅ `backup_falhou` - Falhas em backup
- ✅ `integracao_error` - Erros de integração
- ✅ `custom` - Eventos personalizados

**Funcionalidades:**
- ✅ Registro automático de eventos
- ✅ Priorização (baixa, média, alta, crítica)
- ✅ Gerenciamento de status
- ✅ Geração proativa de eventos
- ✅ Estatísticas e relatórios

### 📊 Monitoramento do Sistema

**Métricas Monitoradas:**
- ✅ Status do servidor (online/offline)
- ✅ Uso de CPU e memória
- ✅ Espaço em disco
- ✅ Status do banco de dados
- ✅ Tempo de resposta
- ✅ Processos ativos
- ✅ Logs de erro

**Funcionalidades:**
- ✅ Monitoramento contínuo
- ✅ Detecção de anomalias
- ✅ Geração automática de alertas
- ✅ Relatórios de saúde do sistema
- ✅ Análise de performance

### ⚙️ Sistema de Automação

**Tipos de Tarefas:**
- ✅ `backup_automatico` - Backup diário
- ✅ `checar_estoque` - Verificação de estoque
- ✅ `analisar_vendas` - Análise de vendas
- ✅ `limpar_logs_antigos` - Limpeza de logs
- ✅ `verificar_eventos_automaticos` - Geração de eventos
- ✅ `executar_script` - Scripts personalizados

**Funcionalidades:**
- ✅ Agendamento de tarefas
- ✅ Recorrência (horária, diária, semanal, mensal)
- ✅ Fila de execução
- ✅ Controle de processos
- ✅ Estatísticas de automação

### 🏢 Modo Operador

**Constante:** `LEO_OPERATOR_MODE`

**Níveis de Autonomia:**
- ✅ `baixa` - Requer confirmação para ações críticas
- ✅ `media` - Autonomia moderada
- ✅ `alta` - Alta autonomia
- ✅ `total` - Controle completo do sistema

**Funcionalidades:**
- ✅ Ativação/desativação do modo
- ✅ Configuração de permissões
- ✅ Definição de restrições
- ✅ Controle de tempo de execução
- ✅ Registro completo de ações

### 🌐 API de Controle

**Endpoint:** `/api/leo/execute`

**Procedimentos Principais:**
- ✅ `executeCommand` - Executar comandos do Leo
- ✅ `getCapabilities` - Obter capacidades
- ✅ `computerControl.*` - Controle de computador
- ✅ `desktopControl.*` - Controle de desktop
- ✅ `screenCapture.*` - Captura de tela
- ✅ `ocr.*` - Funcionalidades OCR
- ✅ `automation.*` - Sistema de automação
- ✅ `events.*` - Gerenciamento de eventos
- ✅ `systemMonitor.*` - Monitoramento
- ✅ `erp.*` - Operações ERP
- ✅ `getStatus` - Status geral

## Como Usar

### 1. Instalação das Dependências

```bash
# Instalar bibliotecas de controle
npm install robotjs screenshot-desktop tesseract.js

# Ou usar script de instalação
npx tsx server/scripts/install-leo-dependencies.ts
```

### 2. Ativar Modo Operador

```typescript
import { leoOperatorMode } from './server/leo/leo-operator-mode';

// Ativar modo com autonomia alta
const resultado = await leoOperatorMode.ativarModoOperador({
  nivelAutonomia: 'alta',
  permissoes: {
    operarErp: true,
    controlarComputador: true,
    capturarTela: true,
    executarOcr: true,
    monitorarSistema: true,
    executarAutomacoes: true,
    gerenciarEventos: true,
  },
});

console.log(resultado.message);
```

### 3. Executar Ações

```typescript
// Controlar computador
await leoComputerControl.moveMouse(100, 200);
await leoComputerControl.clickLeft();
await leoComputerControl.typeText('Hello LEO!');

// Capturar e ler tela
const screenshot = await leoScreen.capturarTela();
const ocrResult = await leoOcr.readTextFromScreen();

// Operar ERP
const pedidos = await leoErpService.getPedidos({ status: 'GERADO' });
const novoPedido = await leoErpService.criarPedido({
  clienteId: 1,
  vendedorId: 1,
  itens: [{ produtoId: 1, quantidade: 2 }]
});

// Criar automação
await leoAutomation.criarTarefa({
  descricao: 'Backup diário',
  acao: 'backup_automatico',
  recorrencia: 'daily',
  agendamento: new Date('2024-01-01T02:00:00')
});
```

### 4. Usar API REST

```typescript
// Via tRPC
const resultado = await api.leoOperator.executeCommand.mutate({
  command: 'verificar estoque baixo',
  usuario: 'admin',
  origem: 'text'
});

// Capturar tela
const screenshot = await api.leoOperator.screenCapture.captureScreen.mutate({
  format: 'png'
});

// Ler texto da tela
const ocrResult = await api.leoOperator.ocr.readScreen.mutate({
  language: 'por'
});
```

### 5. Executar Testes Completos

```bash
# Executar teste completo de validação
npx tsx server/scripts/test-leo-operator.ts
```

## Teste de Validação

O script `test-leo-operator.ts` executa todas as funcionalidades:

1. ✅ **Ativação do modo operador**
2. ✅ **Abertura do bloco de notas**
3. ✅ **Digitação de texto**
4. ✅ **Captura de tela**
5. ✅ **Execução de OCR**
6. ✅ **Consulta ao ERP**
7. ✅ **Geração de relatório**
8. ✅ **Controle de janelas**
9. ✅ **Criação de automação**
10. ✅ **Monitoramento do sistema**
11. ✅ **Gerenciamento de eventos**
12. ✅ **Desativação do modo operador**

## Limitações e Considerações

### Dependências Opcionais
- `robotjs` - Requer build tools nativas
- `screenshot-desktop` - Dependências de sistema
- `tesseract.js` - Download de dados de idioma
- `sharp` - Para processamento avançado de imagens (opcional)

### Segurança
- ✅ Sistema de permissões granular
- ✅ Log completo de todas as ações
- ✅ Configuração de restrições
- ✅ Auditoria completa em `leo_actions_log`

### Performance
- ✅ Padrão singleton para otimização
- ✅ Cache de contexto e resultados
- ✅ Operações assíncronas não-bloqueantes
- ✅ Monitoramento ativo de recursos

### Compatibilidade
- ✅ Windows (suporte completo)
- ✅ Linux (funcionalidades básicas)
- ✅ macOS (funcionalidades básicas)
- ✅ Node.js 18+

## Casos de Uso

### 🏭 Operador Industrial

```typescript
// Monitorar produção 24/7
await leoOperatorMode.ativarModoOperador({
  nivelAutonomia: 'total',
  permissoes: {
    monitorarSistema: true,
    executarAutomacoes: true,
    gerenciarEventos: true
  }
});

// Criar rotinas de produção
await leoAutomation.criarTarefa({
  descricao: 'Monitorar produção',
  acao: 'verificar_producao',
  recorrencia: 'hourly'
});
```

### 🏪 Operador Comercial

```typescript
// Automação de vendas
await leoOperatorMode.ativarModoOperador({
  nivelAutonomia: 'alta',
  permissoes: {
    operarErp: true,
    controlarComputador: true
  }
});

// Processar pedidos automaticamente
const pedidosPendentes = await leoErpService.getPedidos({ 
  status: 'PENDENTE' 
});

for (const pedido of pedidosPendentes.data) {
  await leoErpService.processarPedido(pedido.id);
}
```

### 🏢 Operador Administrativo

```typescript
// Manutenção do sistema
await leoOperatorMode.ativarModoOperador({
  nivelAutonomia: 'media',
  restricoes: {
    requiresConfirmation: true,
    maxExecutionTime: 30
  }
});

// Backup automático
await leoAutomation.criarTarefa({
  descricao: 'Backup diário do sistema',
  acao: 'backup_automatico',
  recorrencia: 'daily',
  agendamento: new Date().setHours(2, 0, 0, 0)
});
```

## Métricas e Monitoramento

### Indicadores Chave

- **Disponibilidade:** Uptime do sistema
- **Performance:** Tempo de resposta das ações
- **Precisão:** Taxa de sucesso das automações
- **Cobertura:** Percentual de funcionalidades ativas
- **Eventos:** Número de eventos gerados/resolvidos
- **Recursos:** Uso de CPU, memória, disco

### Alertas Automáticos

- **Estoque crítico:** < 5 unidades
- **Pedidos atrasados:** > 7 dias
- **Uso de memória:** > 90%
- **Espaço em disco:** < 10%
- **Tempo de resposta BD:** > 5 segundos
- **Taxa de erro:** > 5%

## Futuro e Evolução

### Próximos Passos (Opcional)

1. **Frontend Completo:** Interface web para controle visual
2. **Modo Copiloto:** Sugestões proativas baseadas em IA
3. **Integração Voz:** Comandos por voz
4. **Dashboard Analytics:** Visualização avançada de métricas
5. **API Pública:** Expor funcionalidades via API REST
6. **Modo Cluster:** Múltiplos instâncias do Leo trabalhando juntas

### Expansões Possíveis

- **Integração com outros ERPs:** SAP, Oracle, etc.
- **Controle de dispositivos IoT:** Sensores, câmeras
- **Processamento de imagem:** Análise avançada com Computer Vision
- **Integração com RPA:** Ferramentas profissionais de automação
- **Machine Learning:** Previsões e otimizações inteligentes

## Conclusão

O LEO agora é um **operador autônomo completo** capaz de:

- ✅ **Controlar o computador** inteiro (mouse, teclado, janelas)
- ✅ **Ver e entender a tela** (captura + OCR)
- ✅ **Operar o ERP** completo (pedidos, clientes, estoque, financeiro)
- ✅ **Executar automações** inteligentes e recorrentes
- ✅ **Monitorar o sistema** 24/7 de forma proativa
- ✅ **Gerenciar eventos** e alertas automaticamente
- ✅ **Aprender e evoluir** com base nas interações

O sistema está pronto para operação em produção com todas as funcionalidades testadas e validadas.

---

**Status:** 🟢 **OPERADOR AUTÔNOMO COMPLETO**  
**Versão:** 1.0.0  
**Data:** 2024  
**Documentação:** Completa e atualizada
