/** Normaliza texto: minúsculas, remove acentos (NFD + combining marks). */
export function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
/** Extrai número de pedido: "pedido 123", "0005", "#789", "pedido n 100". */
export function extrairNumeroPedido(texto) {
    const n = normalizarTexto(texto);
    const match = /(?:pedido|numero|num|n[º°]?|#)\s*(\d+)/i.exec(n) ||
        /(\d{3,})\s*(?:pedido)?/i.exec(n);
    if (match && match[1])
        return parseInt(match[1], 10);
    const onlyNum = /^(\d+)$/.exec(n);
    if (onlyNum && onlyNum[1])
        return parseInt(onlyNum[1], 10);
    const pedidoNum = /pedido\s+(\d+)/i.exec(texto);
    if (pedidoNum && pedidoNum[1])
        return parseInt(pedidoNum[1], 10);
    return null;
}
/** Extrai nome de cliente: após "cliente", "do cliente", "está devendo", "boletos da/do", etc. */
export function extrairNomeCliente(texto) {
    const n = normalizarTexto(texto);
    const withQuotes = /(?:cliente|de)\s+["']([^"']+)['"]/i.exec(n);
    if (withQuotes && withQuotes[1])
        return withQuotes[1].trim();
    const afterCliente = /(?:pedidos?\s+do\s+cliente|cliente)\s+([a-z0-9\s]+?)(?:\s*\?|$)/i.exec(n);
    if (afterCliente && afterCliente[1])
        return afterCliente[1].trim().slice(0, 120);
    return null;
}
/** Extrai nome de produto: após "produto", "estoque de", "produto ...". */
export function extrairNomeProduto(texto) {
    const n = normalizarTexto(texto);
    const withQuotes = /(?:produto|estoque\s+de)\s+["']([^"']+)["']/i.exec(n);
    if (withQuotes && withQuotes[1])
        return withQuotes[1].trim();
    const afterProduto = /(?:qual\s+)?(?:estoque\s+do\s+produto|produto)\s+([a-z0-9\s\-]+?)(?:\s*\?|$)/i.exec(n);
    if (afterProduto && afterProduto[1])
        return afterProduto[1].trim().slice(0, 120);
    return undefined;
}
/** Extrai período: hoje, ontem, semana, mês. */
export function extrairPeriodo(texto) {
    const n = normalizarTexto(texto);
    if (/\bhoje\b/.test(n))
        return "hoje";
    if (/\bontem\b/.test(n))
        return "ontem";
    if (/\bsemana\b|\bultima\s+semana\b/.test(n))
        return "semana";
    if (/\bmes\b|\bmes\s+passado\b|\beste\s+mes\b/.test(n))
        return "mes";
    return undefined;
}
/** Extrai tipo de relatório para PDF: estoque, vendas, clientes, produtos. */
export function extrairTipoRelatorioPdf(texto) {
    const n = normalizarTexto(texto);
    if (/(?:gera|gerar|exporta|manda|relatorio|relatorio)\s+(?:de\s+)?estoque|estoque\s+em\s+pdf/.test(n))
        return "estoque";
    if (/(?:gera|gerar|exporta|manda|relatorio)\s+(?:de\s+)?vendas?|vendas?\s+em\s+pdf/.test(n))
        return "vendas";
    if (/(?:gera|gerar|exporta|manda|lista|relatorio)\s+(?:de\s+)?clientes?|clientes?\s+em\s+pdf/.test(n))
        return "clientes";
    if (/(?:gera|gerar|exporta|manda|lista|relatorio)\s+(?:de\s+)?produtos?|produtos?\s+em\s+pdf/.test(n))
        return "produtos";
    return undefined;
}
/** Extrai data simples: dd/mm/aaaa ou "dia 15". */
export function extrairData(texto) {
    const n = normalizarTexto(texto);
    const ddmmyyyy = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(texto);
    if (ddmmyyyy && ddmmyyyy[1] && ddmmyyyy[2] && ddmmyyyy[3]) {
        return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, "0")}-${ddmmyyyy[1].padStart(2, "0")}`;
    }
    return undefined;
}
/** Extrai CEP: 8 dígitos ou 12345-678. */
export function extrairCep(texto) {
    const m = /(\d{5}\-?\d{3})/.exec(String(texto));
    return m && m[1] ? m[1].replace(/\D/g, "") : undefined;
}
/** Extrai CNPJ: 14 dígitos. */
export function extrairCnpj(texto) {
    const m = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2})|(\d{14})/.exec(String(texto));
    return m && (m[1] ?? m[2]) ? (m[1] ?? m[2]).replace(/\D/g, "") : undefined;
}
/** Extrai nome de cidade para clima: "em Vila Velha", "vai chover em Vitória". */
export function extrairCidade(texto) {
    const n = normalizarTexto(texto);
    const em = /(?:vai\s+chover|clima|temperatura|previsao)\s+(?:hoje\s+)?(?:em|em\s+)?\s*([a-záàâãéêíóôõúç\s]+?)(?:\s*\?|$|,)/i.exec(texto);
    if (em && em[1])
        return em[1].trim().slice(0, 80);
    const cep = /(?:cep|endereco)\s+[\d\-]+/.exec(n);
    if (cep)
        return undefined;
    const afterEm = /(?:em|na\s+cidade)\s+([a-záàâãéêíóôõúç\s]+?)(?:\s*\?|$|,)/i.exec(texto);
    if (afterEm && afterEm[1])
        return afterEm[1].trim().slice(0, 80);
    return undefined;
}
/** Extrai código de rastreio (letras e números). */
export function extrairCodigoRastreio(texto) {
    const m = /(?:rastrear|rastreio|onde\s+esta|pedido)\s+(?:numero\s+)?([A-Z]{2}\d{9}\w*|\d{13,})/i.exec(texto);
    if (m && m[1])
        return m[1].trim();
    const onlyCode = /([A-Z]{2}\d{9}\w*)/i.exec(texto);
    return onlyCode && onlyCode[1] ? onlyCode[1].trim() : undefined;
}
/**
 * Extrai todas as entidades relevantes de uma pergunta.
 */
export function extrairEntidades(pergunta) {
    const numeroPedido = extrairNumeroPedido(pergunta);
    const nomeCliente = extrairNomeCliente(pergunta);
    const nomeProduto = extrairNomeProduto(pergunta);
    const data = extrairData(pergunta);
    const periodo = extrairPeriodo(pergunta);
    const tipoRelatorio = extrairTipoRelatorioPdf(pergunta);
    const cep = extrairCep(pergunta);
    const cnpj = extrairCnpj(pergunta);
    const cidade = extrairCidade(pergunta);
    const codigoRastreio = extrairCodigoRastreio(pergunta);
    return {
        ...(numeroPedido != null && { numeroPedido }),
        ...(nomeCliente && { nomeCliente }),
        ...(nomeProduto && { nomeProduto }),
        ...(data && { data }),
        ...(periodo && { periodo }),
        ...(tipoRelatorio && { tipoRelatorio }),
        ...(cep && { cep }),
        ...(cnpj && { cnpj }),
        ...(cidade && { cidade }),
        ...(codigoRastreio && { codigoRastreio }),
    };
}
/** Palavras-chave por intenção (após normalização). */
export const PALAVRAS_CHAVE = {
    pedido_por_numero: [
        /pedido\s+(?:numero|#|n[º°]?)?\s*\d+/,
        /(?:qual|como)\s+(?:esta|ta)\s+o\s+pedido\s+\d+/,
        /(?:dados?|detalhe|info)\s+do\s+pedido\s+\d+/,
    ],
    pedido_por_cliente: [
        /pedidos?\s+do\s+cliente/,
        /cliente\s+[a-z]/,
        /(?:quantos\s+)?pedidos?\s+(?:do|da)\s+/,
    ],
    valor_pedido: [
        /valor\s+do\s+pedido/,
        /total\s+do\s+pedido/,
        /quanto\s+(?:e\s+)?(?:o\s+)?pedido/,
    ],
    vendas_hoje: [
        /vendas?\s+hoje/,
        /vendas?\s+do\s+dia/,
        /(?:como\s+)?foram\s+as\s+vendas/,
        /faturamento\s+hoje/,
    ],
    vendas_mes: [
        /vendas?\s+(?:do\s+)?mes/,
        /faturamento\s+(?:do\s+)?mes/,
    ],
    produto_mais_vendido: [
        /produto\s+mais\s+vendido/,
        /mais\s+vendido/,
        /qual\s+produto\s+(?:mais\s+)?vendeu/,
    ],
    produtos_vendidos_periodo: [
        /produtos?\s+vendidos/,
        /ranking\s+produtos?/,
    ],
    estoque_produto: [
        /estoque\s+(?:do\s+)?produto/,
        /quantidade\s+(?:em\s+)?estoque/,
    ],
    lista_estoque: [
        /lista\s+de\s+estoque/,
        /(?:como\s+)?esta\s+o\s+estoque/,
        /estoque\s+geral/,
    ],
    estoque_baixo: [
        /estoque\s+baixo/,
        /produtos?\s+com\s+estoque\s+baixo/,
    ],
    financeiro_hoje: [
        /financeiro\s+hoje/,
        /caixa\s+hoje/,
        /entrou\s+quanto|saiu\s+quanto/,
    ],
    pagamentos_hoje: [/pagamentos?\s+hoje/, /quanto\s+saiu\s+hoje/],
    recebimentos_hoje: [/recebimentos?\s+hoje/, /quanto\s+entrou\s+hoje/],
    contas_receber: [
        /contas?\s+a\s+receber/,
        /a\s+receber/,
        /(?:valor|total)\s+ a\s+receber/,
    ],
    contas_pagar: [
        /contas?\s+a\s+pagar/,
        /a\s+pagar/,
        /(?:valor|total)\s+a\s+pagar/,
    ],
    vendedores: [/vendedores?/, /lista\s+de\s+vendedores?/],
    clientes: [/lista\s+de\s+clientes?/, /quantos\s+clientes?/],
    clientes_ativos: [
        /clientes?\s+ativos?/,
        /clientes?\s+que\s+(?:mais\s+)?compraram/,
    ],
    pedidos_em_rota: [
        /pedidos?\s+em\s+rota/,
        /em\s+rota/,
        /quantos\s+em\s+rota/,
    ],
    pedidos_atrasados: [
        /pedidos?\s+atrasados?/,
        /tem\s+pedidos?\s+atrasados?/,
    ],
    ranking_produtos: [
        /ranking\s+de\s+produtos?/,
        /top\s+produtos?/,
        /produtos?\s+mais\s+vendidos?/,
    ],
    ranking_clientes: [
        /ranking\s+de\s+clientes?/,
        /top\s+clientes?/,
        /clientes?\s+que\s+mais\s+compraram/,
    ],
    relatorio_pdf_estoque: [
        /gera(?:r)?\s+estoque\s+em\s+pdf/,
        /(?:relatorio|exporta)\s+estoque/,
    ],
    relatorio_pdf_vendas: [
        /gera(?:r)?\s+vendas?\s+em\s+pdf/,
        /(?:relatorio|manda)\s+(?:de\s+)?vendas?/,
    ],
    relatorio_pdf_clientes: [
        /gera(?:r)?\s+clientes?\s+em\s+pdf/,
        /exporta\s+lista\s+de\s+clientes?/,
    ],
    relatorio_pdf_produtos: [
        /gera(?:r)?\s+produtos?\s+em\s+pdf/,
        /exporta\s+lista\s+de\s+produtos?/,
    ],
    cliente_devedor: [
        /quanto\s+(?:o\s+)?[\w\s]+\s+esta\s+devendo/,
        /esta\s+devendo/,
        /quem\s+esta\s+devendo/,
    ],
    boletos_cliente: [/boletos?\s+(?:da|do)\s+/, /boletos?\s+da\s+/],
    recebimentos_periodo: [
        /recebimentos?\s+(?:desta|da)\s+semana/,
        /recebido\s+esta\s+semana/,
    ],
    lista_compras: [
        /o\s+que\s+preciso\s+comprar/,
        /produtos?\s+faltando/,
        /lista\s+de\s+compras?/,
        /o\s+que\s+comprar\s+hoje/,
    ],
    dar_baixa_pedido: [
        /dar\s+baixa\s+(?:no\s+)?pedido/,
        /baixar\s+pedido/,
        /dar\s+baixa\s+em\s+pedido/,
        /confirmar\s+baixa\s+pedido/,
    ],
    registrar_pagamento: [
        /registrar\s+pagamento/,
        /dar\s+baixa\s+(?:em\s+)?(?:conta|boleto)/,
        /marcar\s+(?:conta\s+)?recebida/,
    ],
    consultar_clima: [
        /vai\s+chover/,
        /clima\s+(?:em|hoje)/,
        /temperatura\s+(?:em)?/,
        /previsao\s+do\s+tempo/,
        /como\s+(?:esta|ta)\s+o\s+clima/,
    ],
    consultar_cep: [
        /(?:qual\s+)?(?:o\s+)?endereco\s+do\s+cep/,
        /cep\s+\d/,
        /endereco\s+(?:do\s+)?cep/,
        /buscar\s+cep/,
    ],
    consultar_cnpj: [
        /consulta\s+cnpj/,
        /cnpj\s+\d/,
        /dados\s+do\s+cnpj/,
        /buscar\s+cnpj/,
    ],
    cotar_frete: [
        /(?:qual\s+)?(?:o\s+)?frete\s+mais\s+barato/,
        /cotar\s+frete/,
        /quanto\s+custa\s+o\s+frete/,
    ],
    cotar_frete_superfrete: [
        /qual\s+o\s+frete\s+mais\s+barato\s+para\s+este\s+pedido/,
        /frete\s+superfrete/,
        /cotar\s+superfrete/,
    ],
    gerar_etiqueta_frete: [
        /gera\s+etiqueta\s+de\s+envio/,
        /gerar\s+etiqueta\s+(?:de\s+)?envio/,
        /etiqueta\s+de\s+envio/,
    ],
    rastrear_entrega: [
        /rastrear\s+entrega/,
        /onde\s+esta\s+a\s+entrega/,
        /rastreio\s+entrega/,
    ],
    rastrear_pedido: [
        /onde\s+esta\s+(?:o\s+)?pedido/,
        /rastrear\s+(?:pedido|entrega)/,
        /rastreio\s+do\s+pedido/,
    ],
    gerar_qr: [
        /gerar\s+qr\s+code/,
        /qr\s+code\s+(?:de|para)/,
        /criar\s+qr/,
    ],
    gerar_grafico: [
        /(?:como\s+)?foram\s+as\s+vendas/,
        /grafico\s+de\s+vendas/,
        /mostrar\s+grafico/,
    ],
    consultar_moeda: [
        /qual\s+(?:o\s+)?dolar\s+hoje/,
        /cotacao\s+(?:do\s+)?dolar/,
        /euro\s+hoje/,
        /bitcoin\s+hoje/,
    ],
    ultima_carga_cidade: [
        /ultima\s+carga\s+(?:para|em|na)\s+/,
        /qual\s+(?:foi\s+)?(?:a\s+)?ultima\s+carga\s+para/,
        /ultima\s+entrega\s+(?:para|em)\s+/,
    ],
    rota_ontem: [
        /qual\s+rota\s+fizemos\s+ontem/,
        /rota\s+de\s+ontem/,
        /entregas?\s+ontem/,
    ],
    cidade_mais_entregas: [
        /qual\s+cidade\s+entregamos\s+mais/,
        /cidade\s+que\s+mais\s+entregamos/,
        /mais\s+entregas\s+por\s+cidade/,
    ],
    vendedor_mais_entregas: [
        /qual\s+vendedor\s+(?:teve\s+)?mais\s+entregas/,
        /vendedor\s+com\s+mais\s+entregas/,
        /mais\s+entregas\s+por\s+vendedor/,
    ],
    // Intenções de negócio e métricas
    pedidos_pendentes: [
        /quantos\s+pedidos\s+temos/,
        /pedidos\s+pendentes/,
        /pedidos\s+em\s+aberto/,
        /quantos\s+pedidos\s+estao\s+abertos/,
        /pedidos\s+nao\s+entregues/,
    ],
    resumo_vendas: [
        /resumo\s+de\s+vendas/,
        /sumario\s+de+vendas/,
        /relatorio\s+de+vendas/,
        /como\s+andam\s+as\s+vendas/,
    ],
    resumo_clientes: [
        /quantos\s+clientes/,
        /total\s+de\s+clientes/,
        /resumo\s+de\s+clientes/,
        /quantidade\s+de\s+clientes/,
    ],
    resumo_produtos: [
        /quantos\s+produtos/,
        /total\s+de\s+produtos/,
        /resumo\s+de\s+produtos/,
        /quantidade\s+de\s+produtos/,
    ],
    status_cargas: [
        /cargas\s+do\s+dia/,
        /entregas\s+do\s+dia/,
        /cargas\s+em\s+andamento/,
        /status\s+das\s+cargas/,
        /quantas\s+cargas/,
    ],
    financeiro_resumo: [
        /resumo\s+financeiro/,
        /contas\s+a\s+receber/,
        /contas\s+a\s+pagar/,
        /fluxo\s+de\s+caixa/,
        /situacao\s+financeira/,
    ],
    // Intenções de navegação e descoberta de telas
    onde_cadastra_cliente: [
        /onde\s+cadastro\s+cliente/,
        /onde\s+cadastra\s+cliente/,
        /como\s+cadastro\s+cliente/,
        /tela\s+de\s+cadastro\s+de\s+cliente/,
    ],
    onde_cadastra_produto: [
        /onde\s+cadastro\s+produto/,
        /onde\s+cadastra\s+produto/,
        /como\s+cadastro\s+produto/,
        /tela\s+de\s+cadastro\s+de\s+produto/,
    ],
    onde_vejo_cargas: [
        /onde\s+vejo\s+(?:as\s+)?cargas/,
        /onde\s+estao\s+(?:as\s+)?cargas/,
        /tela\s+de\s+cargas/,
        /listar\s+cargas/,
    ],
    onde_vejo_pedidos: [
        /onde\s+vejo\s+(?:os\s+)?pedidos/,
        /onde\s+estao\s+(?:os\s+)?pedidos/,
        /tela\s+de\s+pedidos/,
        /listar\s+pedidos/,
    ],
    onde_vejo_relatorio: [
        /onde\s+vejo\s+(?:os\s+)?relatorios/,
        /onde\s+estao\s+(?:os\s+)?relatorios/,
        /tela\s+de\s+relatorios/,
        /gerar\s+relatorio/,
    ],
    onde_configuro_sistema: [
        /onde\s+configuro\s+(?:o\s+)?sistema/,
        /onde\s+configura\s+(?:o\s+)?sistema/,
        /tela\s+de\s+configuracoes/,
        /configuracoes\s+do\s+sistema/,
    ],
    onde_vejo_vendas: [
        /onde\s+vejo\s+(?:as\s+)?vendas/,
        /onde\s+estao\s+(?:as\s+)?vendas/,
        /tela\s+de\s+vendas/,
        /nova\s+venda/,
    ],
    onde_vejo_estoque: [
        /onde\s+vejo\s+(?:o\s+)?estoque/,
        /onde\s+esta\s+(?:o\s+)?estoque/,
        /tela\s+de\s+estoque/,
        /consultar\s+estoque/,
    ],
    onde_vejo_clientes: [
        /onde\s+vejo\s+(?:os\s+)?clientes/,
        /onde\s+estao\s+(?:os\s+)?clientes/,
        /tela\s+de\s+clientes/,
        /listar\s+clientes/,
    ],
    onde_vejo_financeiro: [
        /onde\s+vejo\s+(?:o\s+)?financeiro/,
        /onde\s+esta\s+(?:o\s+)?financeiro/,
        /tela\s+financeira/,
        /contas\s+(?:a\s+pagar|a\s+receber)/,
    ],
    onde_vejo_logistica: [
        /onde\s+vejo\s+(?:a\s+)?logistica/,
        /onde\s+esta\s+(?:a\s+)?logistica/,
        /tela\s+de\s+logistica/,
        /entregas/,
    ],
    onde_vejo_vendedores: [
        /onde\s+vejo\s+(?:os\s+)?vendedores/,
        /onde\s+estao\s+(?:os\s+)?vendedores/,
        /tela\s+de\s+vendedores/,
        /listar\s+vendedores/,
    ],
};
/**
 * Identifica a intenção da pergunta usando palavras-chave e entidades.
 */
export function identificarIntencao(pergunta) {
    const entidades = extrairEntidades(pergunta);
    const n = normalizarTexto(pergunta);
    if (entidades.tipoRelatorio) {
        const map = {
            estoque: "relatorio_pdf_estoque",
            vendas: "relatorio_pdf_vendas",
            clientes: "relatorio_pdf_clientes",
            produtos: "relatorio_pdf_produtos",
        };
        return { intencao: map[entidades.tipoRelatorio] ?? "desconhecido", entidades };
    }
    for (const [intencao, regexes] of Object.entries(PALAVRAS_CHAVE)) {
        if (regexes.some((r) => r.test(n))) {
            if (intencao.startsWith("relatorio_pdf_"))
                return { intencao, entidades };
            if (intencao === "pedido_por_numero" && entidades.numeroPedido == null && !/\d+/.test(n))
                continue;
            if ((intencao === "cliente_devedor" || intencao === "boletos_cliente") && !entidades.nomeCliente)
                entidades.nomeCliente = extrairNomeCliente(pergunta) ?? undefined;
            if (intencao === "dar_baixa_pedido" && entidades.numeroPedido == null)
                entidades.numeroPedido = extrairNumeroPedido(pergunta) ?? undefined;
            if ((intencao === "consultar_cep") && !entidades.cep)
                entidades.cep = extrairCep(pergunta);
            if ((intencao === "consultar_cnpj") && !entidades.cnpj)
                entidades.cnpj = extrairCnpj(pergunta);
            if ((intencao === "consultar_clima") && !entidades.cidade)
                entidades.cidade = extrairCidade(pergunta);
            if ((intencao === "rastrear_pedido" || intencao === "rastrear_entrega") && !entidades.codigoRastreio)
                entidades.codigoRastreio = extrairCodigoRastreio(pergunta);
            if (intencao === "ultima_carga_cidade" && !entidades.cidade) {
                const m = /(?:ultima\s+carga|ultima\s+entrega)\s+(?:para|em|na)\s+([a-záàâãéêíóôõúç\s]+?)(?:\s*\?|$|,)/i.exec(pergunta);
                if (m && m[1])
                    entidades.cidade = m[1].trim().slice(0, 80);
            }
            return { intencao, entidades };
        }
    }
    if (entidades.numeroPedido != null)
        return { intencao: "pedido_por_numero", entidades };
    return { intencao: "desconhecido", entidades };
}
