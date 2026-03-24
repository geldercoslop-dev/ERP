/**
 * Verificação de variáveis de ambiente das integrações externas.
 * Retorna lista de integrações configuradas e não configuradas (mensagem amigável).
 */

export type StatusIntegracao = "configurada" | "nao_configurada";

export type ItemIntegracao = {
  nome: string;
  status: StatusIntegracao;
  variaveis: string[];
  mensagem?: string;
};

export type ResultadoVerificacao = {
  configuradas: ItemIntegracao[];
  naoConfiguradas: ItemIntegracao[];
};

function temValor(s: string | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Verifica quais integrações estão configuradas (variáveis de ambiente definidas)
 * e quais não estão. Não testa conectividade, apenas presença das chaves.
 */
export function verificarConfiguracaoIntegracoes(): ResultadoVerificacao {
  const configuradas: ItemIntegracao[] = [];
  const naoConfiguradas: ItemIntegracao[] = [];

  // OpenWeather (clima)
  const openWeatherKey = process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY;
  if (temValor(openWeatherKey)) {
    configuradas.push({
      nome: "OpenWeather (clima)",
      status: "configurada",
      variaveis: ["OPENWEATHER_API_KEY ou OPENWEATHERMAP_API_KEY"],
    });
  } else {
    naoConfiguradas.push({
      nome: "OpenWeather (clima)",
      status: "nao_configurada",
      variaveis: ["OPENWEATHER_API_KEY"],
      mensagem: "Defina OPENWEATHER_API_KEY no .env para consultar clima por cidade.",
    });
  }

  // Melhor Envio (frete)
  const melhorEnvio = process.env.MELHOR_ENVIO_TOKEN;
  if (temValor(melhorEnvio)) {
    configuradas.push({
      nome: "Melhor Envio (frete)",
      status: "configurada",
      variaveis: ["MELHOR_ENVIO_TOKEN"],
    });
  } else {
    naoConfiguradas.push({
      nome: "Melhor Envio (frete)",
      status: "nao_configurada",
      variaveis: ["MELHOR_ENVIO_TOKEN"],
      mensagem: "Defina MELHOR_ENVIO_TOKEN no .env para cotar frete e gerar etiquetas.",
    });
  }

  // SuperFrete (frete)
  const superfreteKey = process.env.SUPERFRETE_API_KEY;
  if (temValor(superfreteKey)) {
    configuradas.push({
      nome: "SuperFrete (frete)",
      status: "configurada",
      variaveis: ["SUPERFRETE_API_KEY"],
    });
  } else {
    naoConfiguradas.push({
      nome: "SuperFrete (frete)",
      status: "nao_configurada",
      variaveis: ["SUPERFRETE_API_KEY"],
      mensagem: "Defina SUPERFRETE_API_KEY no .env para cotar frete, etiquetas e rastreamento SuperFrete.",
    });
  }

  // OCR.space
  const ocrKey = process.env.OCR_SPACE_API_KEY;
  if (temValor(ocrKey)) {
    configuradas.push({
      nome: "OCR.space (leitura de imagens)",
      status: "configurada",
      variaveis: ["OCR_SPACE_API_KEY"],
    });
  } else {
    naoConfiguradas.push({
      nome: "OCR.space (leitura de imagens)",
      status: "nao_configurada",
      variaveis: ["OCR_SPACE_API_KEY"],
      mensagem: "Defina OCR_SPACE_API_KEY no .env para extrair texto de imagens/notas fiscais.",
    });
  }

  // Telegram
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChat = process.env.TELEGRAM_CHAT_ID;
  if (temValor(telegramToken) && temValor(telegramChat)) {
    configuradas.push({
      nome: "Telegram (notificações)",
      status: "configurada",
      variaveis: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    });
  } else {
    const faltando: string[] = [];
    if (!temValor(telegramToken)) faltando.push("TELEGRAM_BOT_TOKEN");
    if (!temValor(telegramChat)) faltando.push("TELEGRAM_CHAT_ID");
    naoConfiguradas.push({
      nome: "Telegram (notificações)",
      status: "nao_configurada",
      variaveis: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
      mensagem: `Defina no .env: ${faltando.join(", ")} para enviar alertas pelo Telegram.`,
    });
  }

  // WhatsApp (Z-API ou Evolution)
  const zapiInstance = process.env.ZAPI_INSTANCE ?? process.env.EVOLUTION_INSTANCE;
  const zapiToken = process.env.ZAPI_TOKEN ?? process.env.EVOLUTION_API_KEY;
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const whatsappOk = (temValor(zapiInstance) && temValor(zapiToken)) || (temValor(evolutionUrl) && temValor(zapiToken));
  if (whatsappOk) {
    configuradas.push({
      nome: "WhatsApp (Z-API ou Evolution)",
      status: "configurada",
      variaveis: ["ZAPI_INSTANCE/ZAPI_TOKEN ou EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE"],
    });
  } else {
    naoConfiguradas.push({
      nome: "WhatsApp",
      status: "nao_configurada",
      variaveis: ["ZAPI_INSTANCE e ZAPI_TOKEN", "ou EVOLUTION_API_URL, EVOLUTION_API_KEY"],
      mensagem: "Configure Z-API (ZAPI_INSTANCE, ZAPI_TOKEN) ou Evolution API no .env para envio de mensagens WhatsApp.",
    });
  }

  return { configuradas, naoConfiguradas };
}
