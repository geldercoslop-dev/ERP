# LEO — Integrações Externas

Módulo de integrações externas **gratuitas** (ou com tier gratuito) conectado ao assistente LEO. O LEO pode consultar serviços externos, automatizar logística, enviar notificações, gerar relatórios visuais e executar utilidades de texto e dados.

---

## Integrações disponíveis

| Serviço | Arquivo | Uso no LEO | Chave/Config |
|--------|---------|------------|--------------|
| **ViaCEP** | `server/integrations/viacep.service.ts` | Endereço por CEP | Nenhuma |
| **BrasilAPI** | `server/integrations/brasilapi.service.ts` | CNPJ, DDD, feriados | Nenhuma |
| **OpenWeatherMap** | `server/integrations/weather.service.ts` | Clima por cidade | `OPENWEATHER_API_KEY` |
| **Melhor Envio** | `server/integrations/freight.service.ts` | Cotar frete, etiqueta | `MELHOR_ENVIO_TOKEN` |
| **LinkeTrack** | `server/integrations/tracking.service.ts` | Rastrear entrega | Opcional (API pública) |
| **Telegram** | `server/integrations/telegram.service.ts` | Mensagens e alertas | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| **WhatsApp** | `server/integrations/whatsapp.service.ts` | Mensagem, boleto, status | Z-API ou Evolution API |
| **OCR.space** | `server/integrations/ocr.service.ts` | Ler documento/NF | `OCR_SPACE_API_KEY` |
| **QuickChart** | `server/integrations/chart.service.ts` | Gráfico de vendas | Nenhuma |
| **goqr / qrserver** | `server/integrations/qr.service.ts` | QR Code | Nenhuma |
| **AwesomeAPI** | `server/integrations/currency.service.ts` | Cotação dólar/euro/bitcoin | Nenhuma |
| **Nominatim (OSM)** | `server/integrations/maps.service.ts` | Endereço → coordenadas | Nenhuma |
| **SuperFrete** | `server/integrations/superfrete.service.ts` | Cotar frete, etiqueta, rastreamento | `SUPERFRETE_API_KEY` |

---

## Integração SuperFrete

- **Cotação:** `cotarFreteSuperFrete(cepOrigem, cepDestino, peso, dimensões)` — retorna opções de frete. Sem `SUPERFRETE_API_KEY` retorna: *"integração SuperFrete não configurada"*.
- **Etiqueta:** `gerarEtiquetaSuperFrete(shipmentId)` — gera etiqueta de envio (requer envio já criado).
- **Rastreamento:** `consultarRastreamentoSuperFrete(codigo)` — consulta eventos de rastreio.
- **Ambiente:** use `SUPERFRETE_SANDBOX=1` para testes (etiquetas sem validade real). Produção: `https://api.superfrete.com`.
- **Cache:** cotações em cache por 5 minutos (igual às demais integrações).
- **Diagnóstico:** a chave `SUPERFRETE_API_KEY` é verificada em `verificarConfiguracaoIntegracoes()` e no script `ERP_DIAGNOSTICO_LEO.bat`.

---

## Configuração de APIs

Crie ou edite o arquivo `.env` na raiz do projeto (ou variáveis de ambiente do servidor).

### Sem chave (já funcionam)

- **ViaCEP**, **BrasilAPI**, **QuickChart**, **QR (api.qrserver.com)**, **AwesomeAPI**, **Nominatim** não exigem chave.

### Com chave (opcional para o LEO responder)

| Variável | Onde obter | Limite gratuito |
|----------|------------|------------------|
| `OPENWEATHER_API_KEY` | https://openweathermap.org/api | 1000 chamadas/dia |
| `MELHOR_ENVIO_TOKEN` | Painel Melhor Envio → API | Conforme plano |
| `TELEGRAM_BOT_TOKEN` | @BotFather no Telegram | Gratuito |
| `TELEGRAM_CHAT_ID` | ID do grupo/canal para alertas | — |
| `ZAPI_INSTANCE` + `ZAPI_TOKEN` | Z-API (WhatsApp) | Conforme plano |
| `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` | Evolution API (self-hosted) | — |
| `OCR_SPACE_API_KEY` | https://ocr.space/ocrapi | 25 req/dia (free) |
| `SUPERFRETE_API_KEY` | https://superfrete.com / Integrar → API | Conforme plano |

### Frete (cotação)

- Para o LEO cotar frete com CEP de origem/destino específicos, use:
  - `CEP_ORIGEM` (ex.: 29100000)
  - `CEP_DESTINO` (ex.: 30130000)

Se não definidos, o backend usa valores padrão para exemplo.

---

## Limites gratuitos (resumo)

| Serviço | Limite típico |
|---------|----------------|
| ViaCEP | Uso razoável, sem cadastro |
| BrasilAPI | Uso razoável |
| OpenWeatherMap | 1000 chamadas/dia |
| QuickChart | Uso razoável (imagens via URL) |
| QR Server | Uso razoável |
| AwesomeAPI | Uso razoável |
| Nominatim | 1 req/seg (política de uso) |
| OCR.space | 25 requisições/dia (free) |
| Telegram | Gratuito (Bot API) |
| Melhor Envio / Z-API / Evolution | Conforme contrato |

---

## Comandos do LEO (exemplos)

- **CEP:** "qual o endereço do CEP 29100000"
- **CNPJ:** "consulta cnpj 12345678000100"
- **Clima:** "vai chover hoje em Vila Velha?"
- **Frete:** "qual o frete mais barato para este pedido?" (Melhor Envio ou SuperFrete; usa CEP_ORIGEM/DESTINO)
- **Etiqueta:** "gera etiqueta de envio" (orientação para usar Cargas ou ID do envio)
- **Rastreio:** "rastrear entrega", "onde está o pedido 0012" (status ERP) ou "rastrear BR123456789BR"
- **Gráfico:** "como foram as vendas?" (gráfico no chat)
- **QR Code:** "gerar qr code de https://meusite.com"
- **Moeda:** "qual o dólar hoje?", "euro hoje?", "bitcoin hoje?"

---

## Comportamento em falha

- **Timeout:** Todas as chamadas HTTP às APIs externas usam `AbortSignal.timeout` (15 s; OCR 30 s, Melhor Envio 20 s). Em timeout ou erro de rede, o LEO retorna mensagem amigável (ex.: "Timeout ao consultar CEP.").
- **Chave não configurada:** Se a integração exigir chave e ela não estiver definida no `.env`, o serviço retorna `ok: false` com mensagem orientando a configuração (ex.: "OpenWeatherMap não configurado. Defina OPENWEATHER_API_KEY.").
- **Verificação programática:** Use `verificarConfiguracaoIntegracoes()` em `server/config/verificarIntegracoes.ts` (ou o procedimento tRPC `diagnostico.integracoes` para admin) para listar integrações configuradas e não configuradas.

## Fluxos críticos preservados

Os status de pedido **gerado → conferido → em_rota → entregue** e **cancelado** não são alterados por este módulo. As integrações apenas **consultam** ou **enviam notificações**; não mudam regras de negócio do ERP.
