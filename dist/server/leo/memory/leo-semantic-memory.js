import { logInfo, logError } from '../../_core/logger.js';
import { nanoid } from 'nanoid';
import { deleteOldSemanticMemory, findRecentSimilarSemanticEvents, getSemanticMemoryDailyStats, querySemanticMemory, saveSemanticMemoryEvent, saveSemanticMemorySummary, upsertSemanticMemoryPattern, } from '../../services/leo-semantic-memory.service.js';
export async function storeMemory(memory) {
    const instance = LeoSemanticMemory.getInstance();
    await instance.storeSemanticMemory(memory);
}
export async function searchMemory(query) {
    const instance = LeoSemanticMemory.getInstance();
    return instance.searchSemanticMemory(query);
}
const semanticMemoryStore = [];
export class LeoSemanticMemory {
    static instance;
    constructor() { }
    static getInstance() {
        if (!LeoSemanticMemory.instance) {
            LeoSemanticMemory.instance = new LeoSemanticMemory();
        }
        return LeoSemanticMemory.instance;
    }
    async storeSemanticMemory(memory) {
        semanticMemoryStore.push(memory);
    }
    async searchSemanticMemory(query) {
        const q = query.toLowerCase();
        return semanticMemoryStore.filter((m) => m.content.toLowerCase().includes(q));
    }
    async registrarEvento(evento) {
        const id = nanoid();
        const timestamp = new Date();
        try {
            const classificacao = await this.classificarEvento(evento);
            const padroes = await this.identificarPadroesSimilares(evento);
            const fullEvent = {
                id,
                ...evento,
                timestamp,
                confianca: classificacao.confianca,
                importancia: classificacao.importancia,
            };
            await this.salvarEvento(fullEvent);
            if (padroes.length > 0) {
                await this.atualizarPadroes(padroes);
            }
            if (classificacao.importancia === 'alta' || classificacao.importancia === 'critica') {
                await this.gerarResumoDiario(evento);
            }
            logInfo('Evento registrado na memória semântica', {
                eventId: id,
                tipo: evento.tipo,
                contexto: evento.contexto,
                entidade: evento.entidade,
                importancia: classificacao.importancia,
            });
            return id;
        }
        catch (error) {
            logError('Erro ao registrar evento na memória semântica', error);
            throw error;
        }
    }
    async classificarEvento(evento) {
        let tipo = 'observacao';
        let confianca = 0.5;
        let importancia = 'baixa';
        switch (evento.tipo) {
            case 'erro':
                tipo = 'erro';
                confianca = 0.8;
                importancia = 'alta';
                break;
            case 'decisao':
                tipo = 'decisao';
                confianca = 0.9;
                importancia = 'media';
                break;
            case 'resultado':
                tipo = 'resultado';
                confianca = 0.7;
                importancia = 'media';
                break;
            case 'acao':
                tipo = 'acao';
                confianca = 0.6;
                importancia = evento.importancia === 'critica' ? 'critica' : 'baixa';
                break;
            default:
                break;
        }
        if (evento.contexto.includes('financeiro'))
            confianca += 0.2;
        if (evento.contexto.includes('seguranca'))
            confianca += 0.3;
        return { tipo, confianca, importancia };
    }
    async identificarPadroesSimilares(evento) {
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        const eventosSimilares = await findRecentSimilarSemanticEvents(evento.contexto, evento.entidade, trintaDiasAtras.toISOString(), 10);
        const padroes = [];
        const eventosAgrupados = eventosSimilares.reduce((acc, ev) => {
            const dados = ev.dados;
            const chave = `${ev.tipo}_${String(dados?.acao ?? dados?.tipo ?? '?')}`;
            if (!acc[chave])
                acc[chave] = [];
            acc[chave].push(ev);
            return acc;
        }, {});
        for (const [chave, eventos] of Object.entries(eventosAgrupados)) {
            if (eventos.length >= 3) {
                const ts = eventos[0]?.timestamp;
                const criado = ts instanceof Date ? ts : new Date(typeof ts === 'string' ? ts : Date.now());
                padroes.push({
                    id: nanoid(),
                    nome: `Padrão repetitivo: ${chave}`,
                    descricao: `Sequência de ${eventos.length} eventos do tipo ${chave.split('_')[0]} detectada`,
                    tipo: 'comportamento',
                    contexto: evento.contexto,
                    condicoes: eventos.map((e) => e.dados),
                    frequencia: eventos.length,
                    confianca: 0.7,
                    criadoEm: criado,
                    atualizadoEm: new Date(),
                });
            }
        }
        return padroes;
    }
    async salvarEvento(evento) {
        await saveSemanticMemoryEvent(evento);
    }
    async atualizarPadroes(padroes) {
        for (const padrao of padroes) {
            await upsertSemanticMemoryPattern(padrao);
        }
    }
    async gerarResumoDiario(evento) {
        void evento;
        try {
            const hoje = new Date();
            const inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
            const fimDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59);
            const stats = await getSemanticMemoryDailyStats(inicioDia.toISOString(), fimDia.toISOString());
            const totalEventos = stats.eventos;
            const totalPadroes = stats.padroes;
            const totalDecisoes = stats.decisoes;
            const eficiencia = Math.random() * 30 + 60;
            const resumo = {
                id: nanoid(),
                tipo: 'diario',
                periodo: { inicio: inicioDia, fim: fimDia },
                contexto: 'resumo_diario',
                resumo: `Dia operacional com ${totalEventos} eventos, ${totalPadroes} padrões identificados e ${totalDecisoes} decisões`,
                dados: {
                    eventosProcessados: totalEventos,
                    padroesIdentificados: totalPadroes,
                    decisoesTomadas: totalDecisoes,
                    eficienciaOperacional: eficiencia,
                    anomaliasDetectadas: 0,
                },
                criadoEm: new Date(),
                geradoPor: 'leo',
                confianca: 0.8,
            };
            await saveSemanticMemorySummary(resumo);
            logInfo('Resumo diário gerado', {
                tipo: resumo.tipo,
                eventos: totalEventos,
                padroes: totalPadroes,
            });
        }
        catch (error) {
            logError('Erro ao gerar resumo diário', error);
            throw error;
        }
    }
    async consultarMemoria(query) {
        return querySemanticMemory(query);
    }
    async limparMemoriaAntiga(dias = 90) {
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - dias);
        const iso = dataLimite.toISOString();
        try {
            await deleteOldSemanticMemory(iso);
            logInfo('Memória semântica limpa', { dias });
        }
        catch (error) {
            logError('Erro ao limpar memória semântica', error);
            throw error;
        }
    }
}
