const DIAS_SEMANA = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
];
/** Retorna contexto de data para o LEO. */
export function getContextoData() {
    const hoje = new Date();
    const inicioAno = new Date(hoje.getFullYear(), 0, 1);
    const fimAno = new Date(hoje.getFullYear(), 11, 31);
    const diasRestantes = Math.ceil((fimAno.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    const diaDaSemana = DIAS_SEMANA[hoje.getDay()] || "";
    return {
        dataAtual: `${dia}/${mes}/${hoje.getFullYear()}`,
        diaDaSemana,
        diasRestantesAno: Math.max(0, diasRestantes),
        mesAno: `${hoje.getFullYear()}-${mes}`,
    };
}
/** Responde perguntas sobre contexto (ex.: "que dia é hoje?", "dias restantes do ano"). */
export function responderContexto(pergunta) {
    const p = pergunta.toLowerCase().trim();
    const ctx = getContextoData();
    if (/que\s+dia\s+e\s+hoje|data\s+atual|hoje\s+e\s+dia/.test(p))
        return `Hoje é ${ctx.diaDaSemana}, ${ctx.dataAtual}.`;
    if (/dia\s+da\s+semana|qual\s+dia/.test(p))
        return `Hoje é ${ctx.diaDaSemana}.`;
    if (/dias?\s+restantes?\s+do\s+ano|fim\s+do\s+ano/.test(p))
        return `Faltam ${ctx.diasRestantesAno} dias para o fim do ano.`;
    return null;
}
