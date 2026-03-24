# LEO v2.0 — Copiloto Inteligente do ERP GRS

O LEO é o assistente administrativo completo do ERP, agora com knowledge engine, navegação por comandos e capacidades expandidas. Capaz de consultar dados, executar ações com confirmação, gerar relatórios, analisar indicadores, navegar pelo sistema e interagir por texto e voz.

## Arquitetura v2.0

### Core AI Services
- **Query Engine:** `server/services/ai/query-engine.ts` — Identificação de intenções e entidades (número de pedido, nome de cliente, período, etc.)
- **ERP AI Service:** `server/services/ai/erp-ai.service.ts` — Processamento principal de perguntas e respostas
- **Finance Engine:** `server/services/ai/finance-engine.ts` — Análise financeira (boletos, contas, recebimentos)
- **Pendências Engine:** `server/services/ai/pendencias-engine.ts` — Gestão de pendências e lista de compras
- **Action Engine:** `server/services/ai/action-engine.ts` — Execução de ações com confirmação
- **Context Engine:** `server/services/ai/context-engine.ts` — Contexto temporal e operacional

### Novos Serviços v2.0
- **App Discovery:** `server/services/ai/app-discovery.service.ts` — Scan automático das telas do sistema
- **Navigation Engine:** `server/services/ai/app-navigation-engine.ts` — Navegação por comandos naturais
- **Knowledge Engine:** Tabela `app_screens` — Registro estruturado de todas as telas
- **Learning Log:** Tabela `leoLearningLog` — Histórico de aprendizado do LEO
- **Actions Log:** Tabela `leoActionsLog` — Auditoria completa de ações executadas

### Cache Global
- **API Cache:** `server/cache/api-cache.ts` — Cache centralizado com estatísticas e limpeza automática
- **TTL padrão:** 5 minutos para integrações externas e dados frequentes

## Capacidades Expandidas v2.0

### 1. Perguntas em Linguagem Natural
- **Consulta de dados:** "Qual o estoque do produto X?", "Quanto cliente Y está devendo?"
- **Relatórios:** "Mostre as vendas de hoje", "Gere relatório de estoque em PDF"
- **Indicadores:** "Quem mais vendeu este mês?", "Produtos com estoque baixo"

### 2. Navegação por Comandos
- **Abertura de telas:** "Leo abre cadastro de clientes", "Leo abre pedidos"
- **Navegação intuitiva:** "Leo vai para financeiro", "Mostrar relatórios"
- **Comandos rápidos:** "Clientes", "Produtos", "Vendas", "Cargas"

### 3. Explicação de Telas
- **Função da tela:** "Para que serve esta tela?", "O que cada módulo faz?"
- **Contexto:** "Onde cadastro dados?", "Como configuro o sistema?"
- **Ajuda contextual:** "Quais ações posso fazer aqui?"

### 4. Ações Executivas (com confirmação)
- **Pedidos:** "Criar pedido para cliente X", "Dar baixa no pedido 5"
- **Financeiro:** "Registrar pagamento da conta Y", "Gerar boleto"
- **Estoque:** "Atualizar estoque do produto Z", "Registrar entrada"
- **Relatórios:** "Gerar relatório de vendas", "Exportar dados"

### 5. Integrações Externas
- **SuperFrete:** "Qual o frete mais barato?", "Gerar etiqueta de envio"
- **APIs:** "Consulta CEP", "CNPJ", "Cotação de moedas", "Clima"
- **QR Code:** "Gerar QR code para este pedido"

## Knowledge Engine

A tabela `app_screens` armazena metadados de todas as telas:

```sql
CREATE TABLE app_screens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  rota VARCHAR(255) NOT NULL UNIQUE,
  descricao TEXT,
  modulo VARCHAR(100) NOT NULL,
  acoes TEXT, -- JSON com ações disponíveis
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
);
```

**Campos principais:**
- `nome`: Nome da tela (ex: "Clientes", "Pedidos")
- `rota`: URL da tela (ex: "/clientes", "/pedidos")
- `modulo`: Módulo (ex: "Cadastros", "Vendas", "Financeiro")
- `acoes`: JSON com ações disponíveis na tela
- `descricao`: Texto explicativo da função da tela

## Navigation Engine

Comandos suportados:
- "abre/abra/abrir + [tela]"
- "onde + [ação] + [entidade]"
- "mostrar + [módulo]"
- "vá para + [local]"

**Exemplos:**
- "Leo abre cadastro de clientes"
- "Onde vejo os pedidos?"
- "Mostrar financeiro"
- "Vá para relatórios"

## Learning System

### Leo Learning Log
Registra interações para aprendizado contínuo:

```sql
CREATE TABLE leo_learning_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pergunta TEXT NOT NULL,
  telaAberta VARCHAR(255),
  acaoExecutada VARCHAR(255),
  usuario VARCHAR(255),
  contexto TEXT, -- JSON adicional
  traceId VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Dados capturados:**
- Perguntas feitas ao LEO
- Telas abertas por comandos
- Ações executadas com sucesso
- Contexto adicional para análise

### Melhoria Contínua
O LEO aprende com:
- Padrões de perguntas frequentes
- Telas mais acessadas
- Ações mais executadas
- Contexto de uso por usuário

## Tipos de Pergunta Suportados

| Categoria | Exemplos |
|-----------|----------|
| **Navegação** | "Onde cadastro cliente?", "Abre pedidos", "Mostrar relatórios" |
| **Consulta** | "Qual o pedido 0005?", "Estoque do produto X", "Cliente Y está devendo?" |
| **Relatórios** | "Vendas do mês", "Relatório de estoque", "Gerar PDF" |
| **Ações** | "Criar pedido para Zé", "Dar baixa no pedido 5", "Registrar pagamento" |
| **Integrações** | "CEP 12345-678", "Cotar frete", "Gerar QR code" |
| **Contexto** | "Que dia é hoje?", "O que esta tela faz?", "Como configuro?" |

## Ações com Confirmação

**Fluxo de confirmação:**
1. Usuário solicita ação
2. LEO mostra resumo (dados, impacto)
3. LEO pergunta: "Confirma execução?"
4. Usuário responde "sim" ou "não"
5. Se sim: executa e registra em `leo_actions_log`
6. Se não: cancela e informa

**Exemplo:**
```
Usuário: Dar baixa no pedido 123
LEO: Pedido #123 - Cliente: João Silva - Valor: R$ 1.500,00
LEO: Confirma baixa do pedido? (sim/não)
Usuário: sim
LEO: ✅ Pedido #123 baixado com sucesso
```

## Auditoria Completa

### Leo Actions Log
Todas as ações executadas são registradas:

```sql
CREATE TABLE leo_actions_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acao VARCHAR(255) NOT NULL,
  usuario VARCHAR(255),
  dados TEXT, -- JSON com dados da ação
  resultado VARCHAR(100), -- SUCESSO, ERRO, PENDENTE
  traceId VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Dados registrados:**
- Tipo de ação executada
- Usuário que solicitou
- Dados completos da ação (JSON)
- Resultado da execução
- TraceID para rastreabilidade

## Uso por Voz

### Entrada (Speech-to-Text)
- Botão microfone no Assistente LEO
- Permissão do navegador para microfone
- Reconhecimento em português brasileiro
- Texto preenchido automaticamente

### Saída (Text-to-Speech)
- Botão alto-falante para ouvir respostas
- Síntese em português brasileiro
- Leitura clara de dados e instruções

## Fluxos Críticos Preservados

Os status de pedido **gerado → conferido → em_rota → entregue** e **cancelado** não são alterados pela arquitetura do LEO. O LEO apenas consulta e, quando autorizado, chama as mesmas funções do sistema.

## Diagnóstico v2.0

Execute `ERP_DIAGNOSTICO_LEO.bat` para verificar:
- ✅ Ambiente (Node, NPM, MySQL)
- ✅ Configuração (.env, integrações)
- ✅ TypeScript e Build
- ✅ Serviços LEO AI
- ✅ Tabelas LEO no schema
- ✅ Cache API
- ✅ App Discovery e Navigation Engine
- ✅ Conexão com banco
- ✅ Servidor rodando

## Hardening e Segurança

- **Tratamento de erro:** Try/catch em todos os engines com fallback seguro
- **Validação:** Nenhanced com validação de comandos e parâmetros
- **Logs:** Estruturados com traceId para rastreabilidade
- **Cache:** TTL automático e limpeza de memória
- **Confirmação:** Nenhado com resumo detalhado antes de executar ações
- **Auditoria:** Logs completos em `leo_actions_log` e `leo_learning_log`

## Próximos Passos (JARVIS)

Estrutura preparada em `server/leo-agent/` para futura automação avançada:
- **Screen Analyzer:** Análise visual de telas
- **Desktop Controller:** Automação de interface gráfica
- **Voice Controller:** Comandos avançados por voz
- **Task Automation:** Fluxos complexos automatizados

---

**LEO v2.0:** Agora com conhecimento completo do sistema, navegação inteligente e aprendizado contínuo para ser o copiloto definitivo do seu ERP.
