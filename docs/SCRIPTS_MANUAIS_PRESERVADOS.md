# Scripts Manuais Preservados

Este documento lista os scripts manuais úteis preservados no projeto após a limpeza P23-R-08J.

**IMPORTANTE:** Estes scripts são ferramentas manuais isoladas e NÃO fazem parte do fluxo automático de CI/CD ou do ciclo de vida normal da aplicação.

---

## Regras Gerais

1. **Scripts manuais não fazem parte do fluxo automático** - não estão em package.json, CI ou Husky
2. **Não executar em produção sem autorização explícita do arquiteto**
3. **Não executar script que toca DB sem backup/checkpoint prévio**
4. **Não usar scripts manuais para contornar guards ou validações**
5. **Não alterar package.json para automatizar scripts manuais sem missão própria**
6. **Se um script ficar obsoleto, deve ser removido em missão própria**
7. **Scripts de diagnóstico/monitoramento devem ser usados apenas em ambientes controlados**

---

## Scripts Preservados

### 1. scripts/backup-database.ts

**Caminho:** `scripts/backup-database.ts`

**Finalidade:** Backup manual do banco de dados MySQL usando a infraestrutura oficial do servidor.

**Tipo:** Backup

**Uso permitido:** Manual controlado

**Risco:** Médio - opera no banco de dados real

**Toca:** DB (MySQL via server/infra/backup/backupDb)

**Pré-requisitos:**
- Variáveis de ambiente configuradas (.env)
- Servidor de MySQL disponível
- Diretório de backups configurado

**Cuidado operacional:**
- Executar apenas quando necessário (antes de migrações, mudanças de schema)
- Verificar espaço em disco antes de executar
- Não executar durante horário de pico de uso
- O script usa `process.exit(1)` em caso de erro

**Motivo de preservação:**
- Ferramenta útil para backup manual antes de operações de risco
- Chamado por `BOTAO_3_BACKUP_DB_DEV.bat` para uso rápido em desenvolvimento
- Usa a infraestrutura oficial de backup do servidor (não implementa lógica própria)

---

### 2. scripts/cleanup-system.ts

**Caminho:** `scripts/cleanup-system.ts`

**Finalidade:** Limpeza automática de logs antigos e backups excedentes.

**Tipo:** Cleanup

**Uso permitido:** Manual ou agendado controlado

**Risco:** Baixo - apenas limpeza de arquivos

**Toca:** Filesystem (logs, backups)

**Pré-requisitos:**
- Diretório de logs configurado
- Diretório de backups configurado
- Permissões de escrita

**Cuidado operacional:**
- Remove logs com mais de 30 dias
- Mantém apenas os últimos 30 backups
- Executar em horários de baixa atividade
- O script usa `process.exit(1)` em caso de erro

**Motivo de preservação:**
- Manutenção preventiva do sistema
- Evita acúmulo excessivo de logs/backups
- Rotina de housekeeping útil para operações

---

### 3. scripts/maintenance/cleanup-idempotency.ts

**Caminho:** `scripts/maintenance/cleanup-idempotency.ts`

**Finalidade:** Limpeza de chaves de idempotência expiradas e travadas.

**Tipo:** Manutenção de DB

**Uso permitido:** Manual controlado

**Risco:** Médio - altera dados no banco (DELETE)

**Toca:** DB (tabela idempotency_keys)

**Pré-requisitos:**
- Banco de dados disponível
- Conexão configurada via .env

**Cuidado operacional:**
- Remove registros com `createdAt` > 7 dias (TTL)
- Remove registros "em processamento" travados > 15 minutos
- Executar apenas quando houver acúmulo de chaves antigas
- O script usa `process.exit(1)` em caso de erro
- NÃO faz backup antes de deletar

**Motivo de preservação:**
- Manutenção necessária da tabela de idempotência
- Evita crescimento descontrolado da tabela
- Remove registros travados que podem bloquear operações

---

### 4. scripts/diagnostics/run-performance-redis.js

**Caminho:** `scripts/diagnostics/run-performance-redis.js`

**Finalidade:** Teste de performance do Redis com carga simulada.

**Tipo:** Diagnóstico de performance

**Uso permitido:** Manual controlado em ambiente de dev/teste

**Risco:** Médio - requer Redis real

**Toca:** Redis

**Pré-requisitos:**
- Redis disponível e configurado
- Variáveis de ambiente REDIS_HOST e REDIS_PORT

**Cuidado operacional:**
- Executar apenas em ambiente de desenvolvimento ou teste
- Não executar em produção sem monitoramento
- O script usa `process.exit(1)` em caso de erro ou configuração faltando
- Documentado em `scripts/diagnostics/README.md`

**Motivo de preservação:**
- Ferramenta de diagnóstico de performance do Redis
- Útil para identificar gargalos de cache
- Focado em validação de infraestrutura

---

### 5. util/tools/monitoring/monitor.ts

**Caminho:** `util/tools/monitoring/monitor.ts`

**Finalidade:** Monitoramento de sistema (CPU, memória, rede) com detecção de problemas.

**Tipo:** Monitoramento

**Uso permitido:** Manual isolado

**Risco:** Baixo - apenas leitura de métricas

**Toca:** HTTP (health check via axios), Filesystem (relatórios)

**Pré-requisitos:**
- URL do servidor configurada (TARGET_URL)
- Servidor rodando para health check

**Cuidado operacional:**
- Apenas monitoramento passivo, não altera dados
- Gera relatório JSON com métricas coletadas
- Detecta memory leaks e altas taxas de erro
- O script usa `process.exit(1)` em caso de erro crítico

**Motivo de preservação:**
- Ferramenta isolada de observabilidade
- Útil para diagnóstico de problemas em produção
- Não está integrado no fluxo automático (uso manual)

---

### 6. scripts/health-external-monitor.mjs

**Caminho:** `scripts/health-external-monitor.mjs`

**Finalidade:** Monitor de health externo contínuo (GET /api/health a cada 10s).

**Tipo:** Monitoramento contínuo

**Uso permitido:** Manual isolado (roda continuamente)

**Risco:** Baixo - apenas monitoramento passivo

**Toca:** HTTP (health check via fetch)

**Pré-requisitos:**
- URL do health monitor configurada (HEALTH_MONITOR_BASE_URL)
- App secret configurado (APP_SECRET)

**Cuidado operacional:**
- Roda continuamente em loop (não termina)
- Loga falhas sem derrubar o processo
- Timeout de 5s para cada health check
- Não usa `process.exit` (roda indefinidamente)

**Motivo de preservação:**
- Monitoramento externo simples de health
- Útil para detectar falhas de disponibilidade
- Não altera dados, apenas monitora

---

### 7. scripts/monitor-production.sh

**Caminho:** `scripts/monitor-production.sh`

**Finalidade:** Script PM2 de monitoramento de produção (Linux/Unix).

**Tipo:** Monitoramento de produção

**Uso permitido:** Manual em ambiente de produção

**Risco:** Baixo - apenas leitura de status PM2

**Toca:** PM2 (process manager)

**Pré-requisitos:**
- PM2 instalado
- Aplicação rodando sob PM2 (nome: erp-app)
- Ambiente Linux/Unix

**Cuidado operacional:**
- Executar apenas em servidor de produção
- Exibe status, métricas, logs e restart history
- Faz health check via curl para localhost:3000
- Não altera dados, apenas monitora

**Motivo de preservação:**
- Ferramenta operacional para monitoramento PM2
- Útil para diagnóstico rápido em produção
- Script shell simples e direto

---

## Classificação por Risco

**BAIXO RISCO (apenas leitura/monitoramento):**
- scripts/cleanup-system.ts
- util/tools/monitoring/monitor.ts
- scripts/health-external-monitor.mjs
- scripts/monitor-production.sh

**MÉDIO RISCO (opera em DB ou infraestrutura):**
- scripts/backup-database.ts
- scripts/maintenance/cleanup-idempotency.ts
- scripts/diagnostics/run-performance-redis.js

---

## Observações

- Este documento registra apenas scripts preservados após a limpeza P23-R-08J.
- Scripts removidos em missões anteriores não devem ser documentados como ativos.
- Qualquer automação futura de scripts manuais exige missão própria.
- Qualquer script que toca DB exige autorização do arquiteto e backup/checkpoint prévio.
- Scripts de diagnóstico devem ser usados apenas em ambientes controlados.
- Se algum script se tornar obsoleto ou duplicado, deve ser removido em missão própria.
