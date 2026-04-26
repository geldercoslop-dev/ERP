# Scripts de Diagnóstico

## ⚠️ AVISO IMPORTANTE

**Esses scripts NÃO fazem parte do runtime da aplicação.**

## 📋 Propósito

Estes scripts são usados **APENAS** para:
- Testes de performance
- Validações manuais de ambiente
- Diagnóstico de infraestrutura
- Debugging de Redis e conexões

## 🚫 Restrições

- **NÃO** devem ser chamados automaticamente pelo sistema
- **NÃO** devem ser importados pelo sistema principal
- **NÃO** são usados pela aplicação em produção
- **NÃO** fazem parte do fluxo normal da aplicação

## 📁 Scripts Disponíveis

- `run-performance-redis.js` - Teste de performance com Redis real
- `run-performance-simple.js` - Simulação simples de performance
- `run-performance-test.js` - Teste de performance padrão
- `test-env-redis.js` - Validação de variáveis de ambiente Redis

## 🎯 Como Usar

Execute manualmente quando necessário para diagnosticar problemas ou testar performance:

```bash
node scripts/diagnostics/run-performance-redis.js
node scripts/diagnostics/test-env-redis.js
```

## ⚠️ Nota

Estes scripts foram movidos de `server/` para `scripts/diagnostics/` para organização, pois não devem estar misturados com o código de produção do servidor.
