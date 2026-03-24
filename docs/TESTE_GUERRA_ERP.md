# Teste de Guerra ERP Completo

Este conjunto de testes foi desenvolvido para validar o comportamento do sistema ERP em condiÃ§Ãµes de uso real intenso, garantindo que o sistema seja robusto, consistente e performÃ¡tico.

## PrÃ©-requisitos

- Node.js 14+ instalado
- Sistema ERP em execuÃ§Ã£o na porta 3000 (ou ajuste a URL nos scripts)
- Banco de dados MySQL configurado e acessÃ­vel
- UsuÃ¡rio admin com email `admin@example.com` e senha `admin123` (ou ajuste nos scripts)

## DependÃªncias

Instale as dependÃªncias necessÃ¡rias:

```bash
npm install axios uuid mysql2 fs
```

## Estrutura dos Testes

O teste de guerra Ã© composto por quatro scripts principais:

1. **teste-carga-erp.js**: Executa fluxos completos (cliente â†’ produto â†’ pedido), teste de duplo clique e operaÃ§Ãµes paralelas.
2. **teste-idempotencia.js**: Testa especificamente a proteÃ§Ã£o contra duplo clique enviando o mesmo pedido mÃºltiplas vezes.
3. **teste-cache.js**: Valida o funcionamento e invalidaÃ§Ã£o do cache.
4. **teste-logs.js**: Verifica o registro de erros e monitoramento.

AlÃ©m disso, hÃ¡ um script principal que executa todos os testes e gera um relatÃ³rio consolidado:

- **teste-guerra-erp.js**: Executa todos os testes e gera um relatÃ³rio consolidado.

## ConfiguraÃ§Ã£o

Antes de executar os testes, verifique e ajuste as configuraÃ§Ãµes nos scripts:

- **API_URL**: URL da API do ERP (padrÃ£o: http://localhost:3000/api/trpc)
- **DB_CONFIG**: ConfiguraÃ§Ãµes de conexÃ£o com o banco de dados
- **Credenciais de login**: Email e senha do usuÃ¡rio admin

## ExecuÃ§Ã£o

### Teste Completo

Para executar todos os testes e gerar um relatÃ³rio consolidado:

```bash
node scripts/teste-guerra-erp.js
```

### Testes Individuais

Para executar testes especÃ­ficos:

```bash
# Teste de carga
node scripts/teste-carga-erp.js

# Teste de idempotÃªncia
node scripts/teste-idempotencia.js

# Teste de cache
node scripts/teste-cache.js

# Teste de logs
node scripts/teste-logs.js
```

## RelatÃ³rios

ApÃ³s a execuÃ§Ã£o dos testes, os seguintes relatÃ³rios sÃ£o gerados:

- **RELATORIO_TESTE_CARGA.md**: Resultados do teste de carga
- **RELATORIO_TESTE_IDEMPOTENCIA.md**: Resultados do teste de idempotÃªncia
- **RELATORIO_TESTE_CACHE.md**: Resultados do teste de cache
- **RELATORIO_TESTE_LOGS.md**: Resultados do teste de logs
- **RELATORIO_TESTE_GUERRA_ERP.md**: RelatÃ³rio consolidado de todos os testes

AlÃ©m disso, os relatÃ³rios em formato JSON tambÃ©m sÃ£o gerados para anÃ¡lise programÃ¡tica.

## CritÃ©rios de Sucesso

Os testes sÃ£o considerados bem-sucedidos quando:

1. **Sem DuplicaÃ§Ã£o**: OperaÃ§Ãµes idÃªnticas nÃ£o resultam em registros duplicados
2. **Sem InconsistÃªncia**: Dados sÃ£o criados e recuperados corretamente
3. **Sem Crash**: O sistema nÃ£o apresenta falhas fatais durante o uso intenso
4. **Cache Efetivo**: O cache melhora o desempenho e Ã© invalidado corretamente
5. **Logs Adequados**: Erros e avisos sÃ£o registrados corretamente

## InterpretaÃ§Ã£o dos Resultados

O relatÃ³rio consolidado apresenta um resultado final (APROVADO ou REPROVADO) com base nos critÃ©rios acima. Se algum dos testes falhar, o resultado geral serÃ¡ REPROVADO e as falhas especÃ­ficas serÃ£o listadas no relatÃ³rio.

O relatÃ³rio tambÃ©m inclui estatÃ­sticas consolidadas, comportamento real observado e recomendaÃ§Ãµes para melhorias.

## CustomizaÃ§Ã£o

Os scripts podem ser customizados para atender a requisitos especÃ­ficos:

- Ajuste o nÃºmero de iteraÃ§Ãµes nos testes de carga
- Modifique os dados de teste para refletir casos de uso especÃ­ficos
- Altere os critÃ©rios de sucesso conforme necessÃ¡rio

## SoluÃ§Ã£o de Problemas

Se os testes falharem, verifique:

1. **ConexÃ£o com o servidor**: Certifique-se de que o servidor ERP estÃ¡ em execuÃ§Ã£o e acessÃ­vel
2. **ConexÃ£o com o banco de dados**: Verifique as configuraÃ§Ãµes de conexÃ£o com o banco de dados
3. **Credenciais de login**: Confirme que as credenciais de login estÃ£o corretas
4. **Logs de erro**: Verifique os arquivos de log gerados (ERRO_*.txt) para mais detalhes

## ManutenÃ§Ã£o

Recomenda-se executar estes testes:

- Antes de cada release para produÃ§Ã£o
- ApÃ³s alteraÃ§Ãµes significativas no sistema
- Periodicamente para garantir a estabilidade contÃ­nua

---

Este conjunto de testes foi desenvolvido como parte do processo de QA para garantir a qualidade e robustez do sistema ERP em condiÃ§Ãµes de uso real intenso.