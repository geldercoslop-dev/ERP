# Environment Variables Obrigatórias

## 🚨 VARIÁVEIS OBRIGATÓRIAS (O sistema NÃO inicia sem elas)

### Database
- `DATABASE_HOST` - Host do banco de dados MySQL
- `DATABASE_NAME` - Nome do banco de dados
- `DATABASE_USER` - Usuário do banco de dados
- `DATABASE_PASSWORD` - Senha do banco de dados

### JWT (Segurança)
- `JWT_SECRET` - Segredo JWT (mínimo 32 caracteres, 64 em produção)
- `JWT_REFRESH_SECRET` - Segredo JWT refresh (mínimo 32 caracteres, 64 em produção)

---

## 📋 VARIÁVEIS OPCIONAIS (com defaults seguros)

### Configurações Básicas
- `NODE_ENV` - Ambiente (default: development)
- `PORT` - Porta do servidor (default: 3000)

### Database (Opcionais)
- `DATABASE_PORT` - Porta do banco (default: 3306)
- `DATABASE_SSL` - Usar SSL (default: false)
- `DATABASE_URL` - URL completa (construída automaticamente se não fornecida)

### JWT (Opcionais)
- `JWT_ISSUER` - Emissor do token (default: erp-system)
- `JWT_AUDIENCE` - Audiência do token (default: erp-users)
- `JWT_EXPIRES_IN` - Expiração do token (default: 15m)
- `JWT_REFRESH_EXPIRES_IN` - Expiração do refresh (default: 7d)

### CORS
- `ALLOWED_ORIGINS` - Origens permitidas (default: http://localhost:3000)
- `CORS_ORIGIN` - Origin específica (sobrescreve ALLOWED_ORIGINS)

### Redis (Cache)
- `REDIS_HOST` - Host Redis (opcional)
- `REDIS_PORT` - Porta Redis (default: 6379)
- `REDIS_PASSWORD` - Senha Redis (opcional)
- `REDIS_DB` - Database Redis (default: 0)

### Email
- `SMTP_HOST` - Host SMTP (opcional)
- `SMTP_PORT` - Porta SMTP (opcional)
- `SMTP_USER` - Usuário SMTP (opcional)
- `SMTP_PASSWORD` - Senha SMTP (opcional)
- `EMAIL_FROM` - Email remetente (opcional)

### Uploads
- `UPLOAD_DIR` - Diretório de uploads (default: ./uploads)
- `MAX_FILE_SIZE` - Tamanho máximo arquivo (default: 10485760 bytes)
- `ALLOWED_FILE_TYPES` - Tipos permitidos (default: jpg,jpeg,png,pdf,doc,docx)

### Logging
- `LOG_LEVEL` - Nível de log (default: info)
- `LOG_FILE` - Arquivo de log (default: ./logs/app.log)
- `LOG_MAX_SIZE` - Tamanho máximo do log (default: 10m)
- `LOG_MAX_FILES` - Número máximo de arquivos (default: 5)

### Rate Limiting
- `RATE_LIMIT_WINDOW_MS` - Janela de rate limit (default: 900000ms)
- `RATE_LIMIT_MAX_REQUESTS` - Requests máximos (default: 1000)
- `AUTH_RATE_LIMIT_MAX` - Rate limit auth (default: 10)

### Segurança
- `ENABLE_HELMET` - Habilitar Helmet (default: true)
- `ENABLE_COMPRESSION` - Habilitar compressão (default: true)
- `TRUST_PROXY` - Confiar em proxy (default: false)

### Monitoramento
- `ENABLE_METRICS` - Habilitar métricas (default: true)
- `HEALTH_CHECK_INTERVAL` - Intervalo health check (default: 30000ms)
- `METRICS_PORT` - Porta métricas (default: 9090)

### Backup
- `BACKUP_ENABLED` - Habilitar backup (default: true)
- `BACKUP_SCHEDULE` - Agendamento backup (default: "0 2 * * *")
- `BACKUP_RETENTION_DAYS` - Dias retenção (default: 30)
- `BACKUP_DIR` - Diretório backup (default: ./backups)

### LEO AI
- `LEO_API_KEY` - API Key LEO (opcional)
- `LEO_RATE_LIMIT` - Rate limit LEO (default: 20)
- `LEO_RATE_WINDOW` - Janela LEO (default: 60000ms)

---

## 🔐 REGRAS DE PRODUÇÃO

Em produção (`NODE_ENV=production`), as seguintes regras adicionais se aplicam:

### Segredos Fortes
- `JWT_SECRET` deve ter **pelo menos 64 caracteres**
- `JWT_REFRESH_SECRET` deve ter **pelo menos 64 caracteres**
- `DATABASE_PASSWORD` deve ter **pelo menos 16 caracteres**

### Senhas Proibidas
- Não pode usar: `password`, `123456`, `admin`, `root`, `default`
- Não pode usar valores padrão inseguros

---

## 🚨 MENSAGENS DE ERRO

Se uma variável obrigatória estiver faltando:

```
❌ ERRO CRÍTICO: Environment inválido

Variáveis obrigatórias faltando ou inválidas:
  ❌ DATABASE_HOST: DATABASE_HOST é obrigatório
  ❌ JWT_SECRET: JWT_SECRET deve ter pelo menos 32 caracteres

📋 SOLUÇÃO:
1. Copie .env.example para .env
2. Configure todas as variáveis obrigatórias
3. Reinicie o servidor

📖 Veja ENV_REQUIRED.md para lista completa
```

---

## 📝 EXEMPLO DE .env

```bash
# OBRIGATÓRIOS
DATABASE_HOST=localhost
DATABASE_NAME=erp_production
DATABASE_USER=erp_user
DATABASE_PASSWORD=sua_senha_forte_aqui
JWT_SECRET=sua_chave_jwt_muito_longa_e_segura_aqui_pelo_menos_32_chars
JWT_REFRESH_SECRET=outra_chave_jwt_muito_longa_e_segura_aqui_pelo_menos_32_chars

# OPCIONAIS (com defaults seguros)
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=info
```

---

## ✅ VALIDAÇÃO AUTOMÁTICA

O sistema valida automaticamente:

1. **No start** - Se alguma obrigatória faltar, o servidor não inicia
2. **Tipagem forte** - Todas variáveis têm validação de tipo
3. **Regras de produção** - Validações adicionais em produção
4. **Mensagens claras** - Erros específicos com soluções

---

## 🔧 INTEGRAÇÃO

Para usar no código:

```typescript
import { getEnv, isProduction } from './server/config/env';

// Acessar environment validado
const env = getEnv();
console.log(env.DATABASE_HOST);

// Verificar ambiente
if (isProduction()) {
  // lógica específica de produção
}
```

O environment é **singleton** e validado apenas uma vez.
