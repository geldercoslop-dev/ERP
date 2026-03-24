# Tracing Setup - ERP System

## 🚀 Iniciar Tracing (Desenvolvimento)

### 1️⃣ Iniciar Jaeger
```bash
docker-compose -f docker-compose.tracing.yml up jaeger
```

### 2️⃣ Acessar Jaeger UI
- **URL**: http://localhost:16686
- **Service**: erp-server

### 3️⃣ Variáveis de Ambiente
```bash
# Opcional - usa defaults se não configurado
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer YOUR_TOKEN
```

## 📊 Visualizar Traces

### Acessar Dashboard
1. Abra http://localhost:16686
2. Selecione "erp-server" no dropdown de serviços
3. Clique "Find Traces"
4. Clique em um trace para ver detalhes

### Informações do Trace
- **Trace ID**: Identificador único da request
- **Spans**: Operações individuais (DB, LEO, API)
- **Timeline**: Duração de cada operação
- **Tags**: Metadata adicional
- **Logs**: Eventos durante execução

## 🔧 Configuração

### Exporter OTLP
- **Endpoint**: http://localhost:4318/v1/traces
- **Protocol**: HTTP
- **Format**: OTLP (OpenTelemetry Protocol)

### Services Instrumentados
- ✅ **tRPC**: Rotas críticas (pedidos, financeiro, LEO)
- ✅ **Database**: Queries MySQL2
- ✅ **HTTP**: Requests e responses
- ✅ **Custom**: Operações específicas do ERP

## 📈 Métricas Disponíveis

### Performance
- Tempo total de requests
- Tempo de queries DB
- Tempo de execução LEO AI
- Taxa de erros

### Operações
- `trpc.pedidos.*` - Operações de pedidos
- `trpc.financeiro.*` - Operações financeiras
- `trpc.leo.*` - Operações LEO AI
- `database.query` - Queries de banco

## 🐛 Debugging

### Verificar Conexão
```bash
# Verificar se Jaeger está recebendo traces
curl http://localhost:16686/api/services
```

### Logs do Sistema
```bash
# Verificar logs de inicialização do tracing
grep "OpenTelemetry" logs/app.log
```

### Testar Manualmente
```bash
# Fazer uma request para gerar trace
curl -X POST http://localhost:3000/trpc/financeiro.listar \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"financeiro.listar","params":{}}'
```

## 🚀 Produção

### Configurar Exporter
```bash
# Environment variables para produção
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-jaeger-collector.com:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer YOUR_JAEGER_TOKEN
```

### Docker Compose Produção
```bash
# Incluir profile de produção
docker-compose -f docker-compose.tracing.yml --profile production up
```

## 📝 Troubleshooting

### Traces não aparecem?
1. Verificar se Jaeger está rodando
2. Verificar endpoint do exporter
3. Verificar logs do servidor
4. Verificar se middleware está aplicado

### Performance impact?
- Mínimo (< 5% overhead)
- Assíncrono (não bloqueia requests)
- Configurável (pode ser desabilitado)

### Logs duplicados?
- Tracing interno mantido
- OpenTelemetry como export adicional
- Sem conflito entre sistemas
