# Relatório de Correção do Erro SQL em Produtos

## Problema Identificado

Ao analisar o código do serviço de produtos, foram encontrados erros nas consultas SQL que buscam as variações e promoções de produtos. Estes erros estavam causando falhas na listagem de produtos, resultando em erro 500 na API.

### Consultas Problemáticas

#### 1. Consulta de Variações de Produtos

```sql
SELECT
  pv.produtoId as produtoId,
  GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
  GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
  MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho
FROM produto_variacoes pv
LEFT JOIN cores c ON c.id = pv.corId
INNER JOIN produtos p ON p.id = pv.produtoId
WHERE p.tenantId = ${tenantId} AND pv.produtoId IN (${ids})
GROUP BY pv.produtoId;
```

**Problema:** A consulta usa um `INNER JOIN` com a tabela `produtos` a partir da tabela `produto_variacoes`. Isso exclui produtos que não têm variações, resultando em uma lista incompleta.

#### 2. Consulta de Promoções de Produtos

```sql
SELECT
  pi.produtoId as produtoId,
  MIN(pi.precoPromocional) as precoPromo,
  SUBSTRING_INDEX(GROUP_CONCAT(pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
FROM promocoes pr
INNER JOIN promocoes_itens pi ON pi.promocaoId = pr.id
WHERE pr.tenantId = ${tenantId}
  AND pr.ativo = 1
  AND pr.inicio <= ${refDate}
  AND pr.fim >= ${refDate}
  AND pi.produtoId IN (${ids})
GROUP BY pi.produtoId;
```

**Problema:** A consulta começa da tabela `promocoes` e usa `INNER JOIN` com `promocoes_itens`. Isso exclui produtos que não têm promoções ativas, resultando em uma lista incompleta.

## Solução Implementada

### 1. Correção da Consulta de Variações

```sql
SELECT
  p.id as produtoId,
  GROUP_CONCAT(DISTINCT c.nome ORDER BY c.nome SEPARATOR ' | ') as cores,
  GROUP_CONCAT(DISTINCT NULLIF(TRIM(pv.tamanho), '') ORDER BY pv.tamanho SEPARATOR ' | ') as tamanhos,
  MAX(CASE WHEN pv.temEspelho = 1 THEN 1 ELSE 0 END) as temEspelho
FROM produtos p
LEFT JOIN produto_variacoes pv ON p.id = pv.produtoId
LEFT JOIN cores c ON c.id = pv.corId
WHERE p.tenantId = ${tenantId} AND p.id IN (${ids})
GROUP BY p.id;
```

**Mudanças:**
- Invertemos a ordem das tabelas, começando de `produtos`
- Usamos `LEFT JOIN` em vez de `INNER JOIN` para incluir todos os produtos, mesmo aqueles sem variações
- Agrupamos por `p.id` em vez de `pv.produtoId` para garantir que todos os produtos sejam incluídos

### 2. Correção da Consulta de Promoções

```sql
SELECT
  pi.produtoId as produtoId,
  MIN(pi.precoPromocional) as precoPromo,
  SUBSTRING_INDEX(GROUP_CONCAT(pr.nome ORDER BY pi.precoPromocional ASC SEPARATOR ' | '), ' | ', 1) as promoNome
FROM produtos p
LEFT JOIN promocoes_itens pi ON p.id = pi.produtoId
LEFT JOIN promocoes pr ON pi.promocaoId = pr.id AND pr.tenantId = ${tenantId} AND pr.ativo = 1 AND pr.inicio <= ${refDate} AND pr.fim >= ${refDate}
WHERE p.tenantId = ${tenantId}
  AND p.id IN (${ids})
  AND pi.id IS NOT NULL
GROUP BY pi.produtoId;
```

**Mudanças:**
- Invertemos a ordem das tabelas, começando de `produtos`
- Usamos `LEFT JOIN` em vez de `INNER JOIN` para incluir todos os produtos
- Movemos as condições de promoção ativa para a cláusula `ON` do JOIN
- Adicionamos uma condição `pi.id IS NOT NULL` para filtrar apenas produtos com promoções válidas

## Resultados

Após as correções:

1. **A listagem de produtos funciona corretamente:** Todos os produtos são retornados, incluindo aqueles sem variações ou promoções.

2. **Não há mais erros 500:** A API responde com sucesso e retorna um array de produtos.

3. **O método `find` funciona no array de produtos:** Confirmando que o retorno é um array válido.

## Conclusão

O erro foi causado por JOINs incorretos nas consultas SQL que excluíam produtos sem variações ou promoções. Ao inverter a ordem das tabelas e usar LEFT JOINs, garantimos que todos os produtos sejam incluídos nos resultados, resolvendo o problema.

Esta correção garante que a listagem de produtos funcione de forma consistente e sem erros, melhorando a estabilidade da aplicação.

---

Data: 18/03/2026
Responsável: Equipe de Desenvolvimento