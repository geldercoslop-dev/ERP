# RELATÓRIO COMPLETO DE AUDITORIA MYSQL
**Data:** 2026-04-26  
**Horário:** 20:17 UTC-03:00  
**Status:** CRÍTICO - Sistema não está rodando

---

## RESUMO EXECUTIVO

### 🚨 PROBLEMA RAIZ IDENTIFICADO
**A aplicação não está conseguindo conectar ao MySQL porque o arquivo `.env` não está sendo montado corretamente no container Docker.**

### Status dos Componentes
- ✅ **MySQL Container:** Rodando e saudável (vendas-mysql)
- ✅ **Redis Container:** Rodando e saudável (vendas-redis)
- ❌ **App Container:** Falhando repetidamente (vendas-app)
- ✅ **Banco de Dados:** Estrutura criada, mas vazio (0 registros)

---

## 1. INFRAESTRUTURA DOCKER

### Containers Ativos
```
CONTAINER ID   IMAGE            STATUS          PORTS
28a091dd92e0   redis:7-alpine   Up (healthy)    0.0.0.0:6379->6379/tcp
981addd4f487   erp-app-dev      Up              0.0.0.0:3000->3000/tcp
7aad683c1e1e   mysql:8.4        Up (healthy)    0.0.0.0:3306->3306/tcp
```

### Configuração MySQL
- **Imagem:** mysql:8.4
- **Porta:** 3306
- **Database:** erp
- **Status:** Healthy
- **Max Connections:** 151
- **InnoDB Buffer Pool:** 128MB
- **Threads Connected:** 1
- **Max Used Connections:** 1

### Problema de Configuração
O container `vendas-app` está rodando mas **não consegue ler as variáveis de ambiente** porque:
1. O arquivo `.env` não existe dentro do container (`/app/.env: No such file or directory`)
2. As variáveis de ambiente não estão sendo passadas corretamente via `env_file`
3. O docker-compose.infra.yml define `env_file: - .env` mas o arquivo não está sendo montado

---

## 2. ESTRUTURA DO BANCO DE DADOS

### Tabelas Criadas (20 tabelas)
```
__drizzle_migrations  - 5 registros
cargas                - 0 registros
clientes              - 0 registros
comissoes             - 0 registros
contas_fixas          - 0 registros
contas_pagar          - 0 registros
contas_receber        - 0 registros
cores                 - 0 registros
counters              - 0 registros
fornecedores          - 0 registros
grupos_precificacao   - 0 registros
itens_pedido          - 0 registros
pedidos               - 0 registros
pedidos_carga         - 0 registros
pendencias_compra     - 0 registros
plano_contas          - 0 registros
produtos              - 0 registros
tenants               - 0 registros
users                 - 0 registros
vendedores            - 0 registros
```

### Índices e Foreign Keys
- ✅ **Índices adequados** para as tabelas principais (tenant_id, status, vendedor_id, cliente_id)
- ✅ **Foreign Keys configuradas** corretamente
- ⚠️ **Banco vazio** - Não há dados para analisar performance de queries

### Migrations Aplicadas
```
ID  Hash                                            Created At
1   bfca6ceb4856446fd9e80c35567299cba8d0a331...   1771126029270
3   b2532384a1271c7c82ee0eeb7186f80aa2d23b51...   1771129015413
5   9031ce5c2cdf022bf1b7b31f5e830b0de1d7f41...   1771130000000
2   89b2e8af2cd06247b90e645280a039e9abf034d...   1771126757780
4   0269d51e38424db34aa1a5e4086dcfc4b8dcc616...   1771129208719
```

---

## 3. ERROS CRÍTICOS IDENTIFICADOS

### Erro 1: Variáveis de Ambiente Ausentes
**Log do container vendas-app:**
```
[ENV] Arquivo .env não encontrado em /app/.env. Variáveis devem vir do ambiente (ex.: env_file no Docker).
[ENV] DATABASE_URL: ausente
[ENV] inválido:
  - APP_SECRET: APP_SECRET must be at least 128 chars
  - JWT_SECRET: JWT_SECRET must be at least 128 chars
  - JWT_ACCESS_SECRET: JWT_ACCESS_SECRET must be at least 128 chars
  - JWT_REFRESH_SECRET: JWT_REFRESH_SECRET must be at least 128 chars
  - DB_USER: Invalid input: expected string, received undefined
  - DB_PASSWORD: Invalid input: expected string, received undefined
[ENV_FATAL] Exiting with process.exit(1)
```

**Impacto:** A aplicação não inicia porque não tem as variáveis de ambiente obrigatórias.

### Erro 2: Configuração Docker Inconsistente
**Problema:** O docker-compose.infra.yml usa `env_file: - .env` mas o arquivo não está sendo montado no container.

**Causa provável:**
- O arquivo `.env` está no host mas não é copiado/montado no container
- O `env_file` do docker-compose precisa do arquivo estar acessível no contexto de build

---

## 4. CONFIGURAÇÃO DE CONEXÃO

### Drizzle ORM Config
**Arquivo:** `drizzle.config.ts`
```typescript
export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: "mysql://root:root@localhost:3306/erp",
  },
  strict: true,
  verbose: false,
});
```

**Problema:** O Drizzle está configurado para conectar em `localhost:3306` com usuário `root`, mas o container app precisa conectar em `vendas-mysql:3306` com o usuário configurado no `.env`.

### Database Config (server/config/database.ts)
**Configuração do Pool:**
- Connection Limit: 20 (configurável via DB_POOL_CONNECTION_LIMIT)
- Queue Limit: 200
- Connect Timeout: 15s
- Max Idle: 20
- Idle Timeout: 60s
- Keep Alive: 30s

**Resiliência:**
- ✅ Health check com cache (30s)
- ✅ Retry com backoff exponencial
- ✅ Circuit breaker configurado
- ✅ Timeout de 10s para queries
- ✅ Monitoramento de queries lentas (>300ms)

---

## 5. PERFORMANCE MYSQL

### Configuração Atual
```
max_connections: 151
innodb_buffer_pool_size: 128MB
query_cache_size: 0 (desativado no MySQL 8.x)
```

### Análise de Performance
- ✅ **Sem locks ativos** - Apenas 1 thread conectada
- ✅ **Sem queries lentas** - Nenhuma query em execução
- ⚠️ **Buffer pool pequeno** - 128MB pode ser insuficiente para produção
- ⚠️ **Max connections padrão** - 151 pode ser baixo para alta concorrência

### Recomendações de Performance
1. **Aumentar innodb_buffer_pool_size** para 512MB-1GB (70-80% da RAM disponível)
2. **Aumentar max_connections** para 200-300
3. **Configurar innodb_log_file_size** para 256MB-512MB
4. **Habilitar slow query log** para monitoramento

---

## 6. DIAGNÓSTICO DE ROTAS

### Arquitetura de Rotas
- **Entry Point:** `server/index.ts` → `bootstrapServer()` → `startServer()`
- **Database Access:** `server/db/index.ts` → `server/db/core.ts` → `server/config/database.ts`
- **ORM:** Drizzle ORM com mysql2

### Serviços que Usam MySQL
Baseado na análise do código, os seguintes serviços dependem do MySQL:
- `orders.service.ts` - Pedidos
- `clientes.service.ts` - Clientes
- `inventory.service.ts` - Produtos/Estoque
- `finance.service.ts` - Financeiro
- `logistica.service.ts` - Cargas/Logística
- `users.service.ts` - Usuários
- `promocoes.service.ts` - Promoções
- `pendencias.service.ts` - Pendências

**Impacto:** Nenhum destes serviços está funcionando porque o app não inicia.

---

## 7. SOLUÇÕES IMEDIATAS

### Solução 1: Corrigir Variáveis de Ambiente no Docker (RECOMENDADO)

**Passo 1:** Verificar se o arquivo `.env` existe no host
```bash
ls -la .env
```

**Passo 2:** Atualizar o docker-compose.infra.yml para passar as variáveis explicitamente
```yaml
app:
  build:
    context: .
    dockerfile: Dockerfile.dev
  image: erp-app-dev
  container_name: vendas-app
  working_dir: /app
  restart: unless-stopped
  depends_on:
    vendas-mysql:
      condition: service_healthy
    redis:
      condition: service_healthy
  env_file:
    - .env
  environment:
    NODE_ENV: development
    DATABASE_URL: ${DATABASE_URL}
    REDIS_URL: redis://redis:6379
    REDIS_HOST: redis
    REDIS_PORT: "6379"
    # Adicionar estas variáveis explicitamente:
    APP_SECRET: ${APP_SECRET}
    JWT_SECRET: ${JWT_SECRET}
    JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
    JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
    SESSION_SECRET: ${SESSION_SECRET}
  ports:
    - "3000:3000"
  networks:
    - vendas-network
  command: sh -c "pnpm dev"
```

**Passo 3:** Recriar o container
```bash
docker-compose -f docker-compose.infra.yml down app
docker-compose -f docker-compose.infra.yml up -d app
```

### Solução 2: Executar Localmente (Alternativa)

Se o Docker continuar com problemas, executar localmente:

```bash
# No diretório c:\ERP
pnpm install
pnpm dev
```

Isso usará o `.env` local diretamente.

### Solução 3: Seed do Banco de Dados

Após corrigir a conexão, o banco está vazio e precisa de dados:

```bash
# Executar seed de tenant
docker exec vendas-app pnpm tsx server/scripts/seed-tenant.ts

# Ou executar localmente
pnpm tsx server/scripts/seed-tenant.ts
```

---

## 8. BLINDAGEM E SEGURANÇA

### Configurações de Segurança Atuais
- ✅ **Validação de variáveis de ambiente** - Fail-fast se secrets são muito curtos
- ✅ **Proteção de serviços** - Service guard implementado
- ✅ **Bootstrap controlado** - Zero import-time side effects
- ✅ **Resiliência de conexão** - Retry com circuit breaker
- ⚠️ **Senhas padrão** - O docker-compose usa placeholders que precisam ser substituídos

### Recomendações de Segurança
1. **Gerar secrets seguros** (mínimo 128 caracteres):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

2. **Atualizar .env** com secrets reais
3. **Configurar HTTPS** para produção
4. **Implementar rate limiting** na API
5. **Configurar firewall** no MySQL (só permitir conexões do container app)

---

## 9. GARGALOS IDENTIFICADOS

### Gargalo 1: Configuração Docker
**Severidade:** CRÍTICA  
**Impacto:** Sistema não inicia  
**Solução:** Corrigir montagem do .env no container

### Gargalo 2: Buffer Pool MySQL
**Severidade:** MÉDIA  
**Impacto:** Performance limitada em produção  
**Solução:** Aumentar innodb_buffer_pool_size para 512MB+

### Gargalo 3: Max Connections
**Severidade:** BAIXA  
**Impacto:** Pode limitar concorrência  
**Solução:** Aumentar para 200-300

### Gargalo 4: Banco Vazio
**Severidade:** MÉDIA  
**Impacto:** Sistema funcional mas sem dados  
**Solução:** Executar scripts de seed

---

## 10. CHECKLIST DE AÇÃO

### Imediato (CRÍTICO)
- [ ] Corrigir variáveis de ambiente no docker-compose.infra.yml
- [ ] Recriar container vendas-app
- [ ] Verificar logs do container app
- [ ] Testar conexão com MySQL
- [ ] Executar seed do banco de dados

### Curto Prazo (24h)
- [ ] Aumentar innodb_buffer_pool_size
- [ ] Aumentar max_connections
- [ ] Configurar slow query log
- [ ] Gerar secrets seguros
- [ ] Atualizar .env com secrets reais

### Médio Prazo (1 semana)
- [ ] Implementar monitoramento (Prometheus/Grafana)
- [ ] Configurar alertas de saúde do banco
- [ ] Otimizar índices baseado em queries reais
- [ ] Implementar backup automático
- [ ] Configurar replicação (master-slave)

---

## 11. CONCLUSÃO

### Status Atual
❌ **SISTEMA NÃO FUNCIONAL** - A aplicação não consegue iniciar devido a problemas de configuração de variáveis de ambiente no Docker.

### Causa Raiz
O arquivo `.env` não está sendo montado corretamente no container `vendas-app`, causando falha na validação de variáveis de ambiente obrigatórias (DATABASE_URL, JWT secrets, etc.).

### Próximo Passo
Corrigir a configuração do docker-compose.infra.yml para passar as variáveis de ambiente explicitamente e recriar o container app.

### Tempo Estimado para Correção
**15-30 minutos** para corrigir a configuração e restaurar o funcionamento do sistema.

---

## 12. ANEXOS

### Comandos Úteis

```bash
# Verificar status dos containers
docker-compose -f docker-compose.infra.yml ps

# Verificar logs do app
docker logs vendas-app -f

# Verificar logs do MySQL
docker logs vendas-mysql -f

# Conectar no MySQL
docker exec -it vendas-mysql mysql -uroot -proot

# Verificar variáveis de ambiente no container
docker exec vendas-app env

# Recriar container app
docker-compose -f docker-compose.infra.yml down app
docker-compose -f docker-compose.infra.yml up -d app

# Verificar tabelas do banco
docker exec vendas-mysql mysql -uroot -proot -e "USE erp; SHOW TABLES;"

# Verificar conexões ativas no MySQL
docker exec vendas-mysql mysql -uroot -proot -e "SHOW PROCESSLIST;"
```

### Contato
Para suporte adicional, verificar:
- `docs/ENV_REQUIRED.md`
- `docs/WORKFLOW_DESENVOLVIMENTO.md`
- `deployment/DEPLOY.md`
