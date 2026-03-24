# ⚡ Quick Start: Testes de Consistência do Banco

## 3 Passos Para Validar Se Seu Banco Está Seguro

### 1️⃣ Verificar Se MySQL Está Rodando
```bash
npm run test:db
```
Se passar, continua. Se falhar, iniciar MySQL.

### 2️⃣ Executar Testes
**Windows:**
```bash
.\run-database-tests.bat
```

**Linux/Mac:**
```bash
bash run-database-tests.sh
```

**Ou (cualquier plataforma):**
```bash
npm run test:consistency
```

### 3️⃣ Ler Os Resultados

**Se TODOS passarem** ✅
```
✅ PASSOU: 4/4
✅ BANCO DE DADOS ESTÁ SEGURO PARA PRODUÇÃO
```

**Se ALGUM falhar** ❌
```
❌ FALHOU: 1/4
Detalhes em: DATABASE_CONSISTENCY_REPORT.json
```

---

## O Que Os Testes Fazem?

### Teste 1: Rollback
Simula um erro no meio de uma transação. Valida que **TUDO** volta ao estado anterior.

### Teste 2: Concorrência
2 pedidos ao mesmo produto simultâneos. Valida que estoque **nunca fica negativo**.

### Teste 3: Idempotência
Mesmo pedido 10x em paralelo. Valida que **apenas 1 é criado**.

### Teste 4: Integridade
Verifica que pedidos, itens, totais e referências **estão corretas**.

---

## 📊 Entender Os Resultados

Abrir: `DATABASE_CONSISTENCY_REPORT.json`

```json
{
  "summary": {
    "totalTests": 4,
    "passed": 4,
    "failed": 0
  },
  "fragilePoints": [],
  "recommendations": [
    "Sistema está operacional para produção"
  ]
}
```

---

## 🚨 Se Falhar?

Cada falha tem recomendação no relatório.

Exemplo:
```json
{
  "fragilePoints": [
    "❌ Race condition no estoque não tratada"
  ],
  "recommendations": [
    "Adicionar SELECT ... FOR UPDATE em updateEstoque()",
    "Implementar pessimistic locking"
  ]
}
```

---

## ⏱️ Tempo Total

Tudo junto leva **~5 minutos** (máquina normal):
- Setup: 30s
- Testes: 2-3s
- Análise: 1s
- Limpeza: 1s

---

## 🆘 Problemas Comuns

| Problema | Solução |
|----------|---------|
| "Database não disponível" | `npm run test:db` |
| "File not found" | Rodar do root do projeto |
| "Permission denied" | `chmod +x run-database-tests.sh` (Linux) |
| Testes muito lentos | Normal, BD pode estar ocupado |

---

## 📖 Documentação Completa

- [DATABASE_CONSISTENCY_TESTS.md](DATABASE_CONSISTENCY_TESTS.md) - Tudo em detalhes
- [PHASE3_DATABASE_TESTING_SUMMARY.md](PHASE3_DATABASE_TESTING_SUMMARY.md) - Visão geral
- [DATABASE_CONSISTENCY_REPORT.json](DATABASE_CONSISTENCY_REPORT.json) - Resultados da última execução

---

**Status**: ✅ PRONTO PARA USAR

Próximo: Executar e revisar resultados!
