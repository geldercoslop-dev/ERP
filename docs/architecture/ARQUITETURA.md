# Arquitetura — GRS ERP v2.0

Visão técnica do sistema: stack, banco de dados e convenções.

---

## Stack

- **Frontend:** React 19, Vite, wouter (rotas), TanStack Query, tRPC client, Tailwind CSS
- **Backend:** Node.js, Express, tRPC, Drizzle ORM
- **Banco:** MySQL (utf8mb4)
- **Auth:** Sessão por cookie + header X-Session-Token; roles admin / vendedor
- **AI Engine:** LEO - Copiloto inteligente com knowledge engine e navegação por comandos

---

## Base de dados

- **Schema:** Drizzle em `drizzle/schema.ts`
- **Migrações:** `drizzle/migrations/` — em produção usar apenas `db:generate` + `db:migrate` (nunca `db:push`)
- **Versão esperada:** `server/_core/schemaVersion.ts` (EXPECTED_SCHEMA_VERSION); `/api/health` compara com a versão gravada no banco

### Novas tabelas LEO AI

- **app_screens:** Knowledge engine com informações de todas as telas do sistema
- **leoLearningLog:** Histórico de aprendizado do LEO (perguntas, telas abertas, ações)
- **leoActionsLog:** Registro de ações executadas pelo LEO (auditoria)

### Comandos

| Comando | Uso |
|--------|-----|
| `npm run check:db` | Testa conexão e lista tabelas |
| `npm run db:push:dev` | Só DEV — sincroniza schema com o banco |
| `npm run db:generate` | Gera migrações a partir do schema |
| `npm run db:migrate` | Aplica migrações pendentes (backup antes em PROD) |

### Variáveis de ambiente

- **Opção 1:** `DATABASE_URL=mysql://usuario:senha@host:porta/base`
- **Opção 2:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

---

## LEO AI - Sistema Inteligente

### Knowledge Engine

- **Service:** `server/services/ai/app-discovery.service.ts` - Scan automático das telas
- **Service:** `server/services/ai/app-navigation-engine.ts` - Navegação por comandos
- **Service:** `server/services/ai/query-engine.ts` - Processamento de perguntas naturais

### Capacidades do LEO

1. **Perguntas em linguagem natural:**
   - "Onde cadastro cliente?"
   - "Qual o estoque do produto X?"
   - "Mostre as vendas de hoje"

2. **Comandos de navegação:**
   - "Leo abre cadastro de clientes"
   - "Leo abre pedidos"
   - "Leo abre relatório de vendas"

3. **Explicação de telas:**
   - "Para que serve esta tela?"
   - "O que cada módulo faz?"

4. **Ações executivas:**
   - "Criar pedido para cliente X"
   - "Gerar relatório de vendas"
   - "Consultar estoque baixo"

### Cache Global

- **Service:** `server/cache/api-cache.ts` - Cache centralizado com TTL de 5 minutos
- **Features:** Estatísticas, limpeza automática, expiração por tempo
- **Uso:** Integrações externas, dados frequentes, respostas do LEO

---

## Integração SuperFrete

- **Serviço:** `server/integrations/superfrete.service.ts` — cotação de frete, etiqueta e rastreamento.
- **Variável:** `SUPERFRETE_API_KEY` (obrigatória para uso). Sem chave, o LEO retorna: "integração SuperFrete não configurada".
- **Sandbox:** defina `SUPERFRETE_SANDBOX=1` para usar o ambiente de testes da SuperFrete.
- **Cache:** cotações em cache por 5 minutos (evita chamadas excessivas). Status da integração aparece em `diagnostico.integracoes` e no script `ERP_DIAGNOSTICO_LEO.bat`.

---

## Contratos e regras (não alterar)

- Regras de pedidos, estoque, financeiro, cargas e pendências
- Contratos de API (tRPC)
- Transações e idempotência
- Fluxo de autenticação e sessão
- **Fluxos críticos:** gerado → conferido → em_rota → entregue (cancelado à parte)

---

## Diagnóstico do sistema

- **Script de diagnóstico LEO v2.0:** `ERP_DIAGNOSTICO_LEO.bat` (raiz do projeto) — verifica Node, NPM, MySQL, `.env`, integrações, TypeScript, build, e verificações específicas das capacidades LEO AI.
- **Verificação de integrações:** `server/config/verificarIntegracoes.ts` exporta `verificarConfiguracaoIntegracoes()`, retornando lista de integrações configuradas e não configuradas (variáveis de ambiente). Exposta ao admin em `diagnostico.integracoes` (tRPC).
- **Health check:** `/health` e `/api/health` para monitoramento e load balancers.

---

## Estrutura LEO Agent (Preparação Jarvis)

- **Diretório:** `server/leo-agent/` - Estrutura futura para automação avançada
- **Arquivos planejados:** `screen-analyzer.ts`, `desktop-controller.ts`, `voice-controller.ts`
- **Objetivo:** Interface para futura automação do computador pelo JARVIS

Documentação operacional: `docs/OPERACAO.md`. Deploy: `docs/DEPLOY.md`. Segurança: `docs/SEGURANCA.md`. LEO/JARVIS: `docs/LEO_JARVIS.md`.
