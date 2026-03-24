# 🎛️ QUICK START: CONTROL CENTER

**Status:** ✅ Pronto para usar  
**Validação:** tsc passou (0 erros)

---

## 🚀 ACESSAR O PAINEL

### URL
```
http://localhost:3000/control-panel
```

**Requisitos:**
- ✅ Estar logado
- ✅ Ser admin
- ✅ Backend rodando

---

## 📊 O QUE VOCÊ ENCONTRA

### 🟦 ABA 1: SAÚDE (Dashboard de Monitoramento)

**Status do Sistema em Tempo Real**

```
├─ Database
│  ├─ Tempo de resposta
│  └─ Conexões ativas/máximo
├─ CPU
│  ├─ Carga (cores)
│  └─ Load Average
├─ Memória
│  ├─ Heap (Node.js)
│  └─ RAM (Sistema)
└─ API
   ├─ Latência média
   └─ Taxa de erro
```

**Auto-atualiza a cada 2 segundos** 🔄

**Barras dinâmicas:**
- 🟢 Verde: >80% saudável
- 🟡 Amarelo: 50-80% aviso
- 🔴 Vermelho: <50% crítico

---

### 🟪 ABA 2: INSIGHTS (Dashboard de Negócios)

**Análise Inteligente do LEO**

```
├─ Métricas de vendas
├─ Gráfico: Produtos mais vendidos
├─ Lista: Top clientes
└─ Alertas: Estoque baixo
```

**Dados:** Tempo real via tRPC

---

### 🟧 ABA 3: AÇÕES (Painel de Controle)

**Ações Sugeridas pelo LEO**

```
Estados de ação:
├─ ⏳ Pendentes      [Confirmar] [Rejeitar]
├─ ✓ Confirmadas    [Executar Agora]
├─ ✅ Executadas    (histórico)
└─ ❌ Rejeitadas    (histórico)
```

**Exemplo de ação:**
```
"Criar Pedido #12345"
Cliente: João Silva
Quer: 10x Cadeira Gamer vermelha
Impacto: Alto
Tempo: 5 minutos atrás
```

---

## 🎮 COMO USAR

### 1️⃣ Navegar entre Abas
```
Clique em: [Saúde] [Insights] [Ações]
```

### 2️⃣ Confirmar uma Ação
```
1. Vá para aba [Ações]
2. Leia o detalhamento
3. Clique [Confirmar] (ou [Rejeitar])
4. Status muda para "Confirmada"
```

### 3️⃣ Executar uma Ação Confirmada
```
1. Ação confirmada aparece em "Confirmadas"
2. Clique [Executar Agora]
3. Spinner mostra processamento
4. Status muda para "Executada"
```

### 4️⃣ Configurar Alertas (Opcional)
```
Abra: ⚙️ Configurações de Alertas
Configure:
  - Limiar de memória (%)
  - Latência máxima (ms)
Clique: [Aplicar]
```

---

## 📱 RESPONSIVIDADE

| Dispositivo | Layout |
|-------------|--------|
| 📱 Mobile | Stack vertical |
| 📑 Tablet | 2-3 colunas |
| 🖥️ Desktop | 4 colunas |

**Funciona em:**
- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

---

## 🔍 VALIDAÇÕES

**TypeScript:**
```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
# Resultado: ✅ 0 erros
```

**Build:**
```bash
pnpm run build
# Resultado: ✅ Sucesso
```

**Dev:**
```bash
pnpm run dev
# Navegue: http://localhost:3000/control-panel
# Resultado: ✅ Funcionando
```

---

## 🐛 TROUBLESHOOTING

### ❓ "Página em branco"
→ Verifique se está logado (pode redirecionar para login)

### ❓ "401 Unauthorized"
→ Verifique se é admin (requisito para acessar)

### ❓ "Dados não aparecem"
→ Verifique se backend está rodando:
```bash
curl http://localhost:3000/health
# Deve retornar JSON com status
```

### ❓ "Gráficos quebrados"
→ Verifique console (F12) para erros
→ Recarregue a página
→ Reinicie dev server

---

## ⚡ SHORTCUTS

- **Refresh manual:** Clique ⟲ (botão ao lado do status)
- **Alternar abas:** Clique nos labels [Saúde] [Insights] [Ações]
- **Expandir alertas:** Clique ⚙️ Configurações de Alertas
- **Voltar:** Use navegação do app ou `/` para home

---

## 🎯 PRÓXIMOS PASSOS

1. **Hoje:** Explore o painel, veja os dados em tempo real
2. **Semana:** Integre com seu fluxo de trabalho
3. **Futuro:** Configure alertas personalizados (backend)

---

## 📊 INFORMAÇÕES TÉCNICAS

**Componentes:**
- ✅ HealthMonitor.tsx (180 linhas)
- ✅ LeoActionPanel.tsx (280 linhas)
- ✅ ControlPanel.tsx (200 linhas)

**Endpoints usados:**
- `/health` (backend existente)
- `/api/metrics` (backend existente)
- tRPC (products, clientes, pedidos)

**Nenhuma alteração no backend** ✅

---

## 💬 FEEDBACK

Teste o Control Center e relate:
- ✨ Funcionalidades que funcionam bem
- 🐛 Bugs ou comportamentos inesperados
- 🎨 Sugestões de UI/UX
- ⚡ Pedidos de features

---

**Pronto para usar!** 🚀

