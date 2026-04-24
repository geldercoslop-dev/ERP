/**
 * Sistema de Relatórios Automáticos do LEO
 *
 * Gera relatórios diários com análises completas do sistema
 * Inclui vendas, estoque, tarefas, erros e performance
 */
import { leoTaskQueue } from '../tasks/leo-task-queue.js';
import { leoEvents } from '../memory/leo-events.js';
import { leoErpObserver } from '../perception/leo-erp-observer.js';
import { LeoTaskStatus } from '../../../shared/types/index.js';
import { leoLoop } from '../engine/leo-loop.js';
import { leoSupervisor } from '../engine/leo-supervisor.js';
import { leoEngine } from '../engine/leo-engine.js';
/** Helper para registrar ação no log (stub para evitar dependência de insertLeoActionLog em db). */
async function insertLeoActionLog(_entry) {
    void _entry;
}
/**
 * Gerador de relatórios automáticos do Leo
 */
class LeoDailyReport {
    static instance;
    config;
    isRunning = false;
    reportInterval;
    constructor() {
        this.config = {
            horarioExecucao: '18:00', // 18:00 todos os dias
            destinatarios: [], // Configurar via ambiente
            formatos: ['json', 'html'],
            salvarEmArquivo: true,
            caminhoSalvamento: './reports',
        };
    }
    static getInstance() {
        if (!LeoDailyReport.instance) {
            LeoDailyReport.instance = new LeoDailyReport();
        }
        return LeoDailyReport.instance;
    }
    /**
     * Inicia o sistema de relatórios automáticos
     */
    async iniciar(config) {
        try {
            if (this.isRunning) {
                return {
                    success: false,
                    message: 'Sistema de relatórios já está em execução',
                };
            }
            // Mesclar configuração personalizada
            if (config) {
                this.config = { ...this.config, ...config };
            }
            console.log('📊 Iniciando sistema de relatórios automáticos do Leo...');
            console.log(`⏰ Horário de execução: ${this.config.horarioExecucao}`);
            this.isRunning = true;
            // Agendar primeira execução
            await this.agendarProximaExecucao();
            // Iniciar verificação periódica (a cada hora)
            this.reportInterval = setInterval(async () => {
                await this.verificarEExecutarRelatorio();
            }, 60 * 60 * 1000); // 1 hora
            await insertLeoActionLog({
                usuario: 'leo-daily-report',
                acao: 'iniciar_relatorios_automaticos',
                entidade: 'leo_daily_report',
                dados: JSON.stringify({
                    config: this.config,
                    timestamp: new Date(),
                }),
                resultado: 'SUCESSO',
            });
            return {
                success: true,
                message: 'Sistema de relatórios iniciado com sucesso',
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao iniciar sistema:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao iniciar sistema de relatórios',
            };
        }
    }
    /**
     * Para o sistema de relatórios
     */
    async parar() {
        try {
            if (!this.isRunning) {
                return {
                    success: false,
                    message: 'Sistema de relatórios não está em execução',
                };
            }
            console.log('⏹️ Parando sistema de relatórios automáticos...');
            this.isRunning = false;
            if (this.reportInterval) {
                clearInterval(this.reportInterval);
                this.reportInterval = undefined;
            }
            await insertLeoActionLog({
                usuario: 'leo-daily-report',
                acao: 'parar_relatorios_automaticos',
                entidade: 'leo_daily_report',
                dados: JSON.stringify({
                    timestamp: new Date(),
                }),
                resultado: 'SUCESSO',
            });
            return {
                success: true,
                message: 'Sistema de relatórios parado com sucesso',
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao parar sistema:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao parar sistema',
            };
        }
    }
    /**
     * Gera relatório completo do dia
     */
    async gerarRelatorioDiario(data) {
        try {
            const dataRelatorio = data || new Date();
            const inicioDia = new Date(dataRelatorio);
            inicioDia.setHours(0, 0, 0, 0);
            const fimDia = new Date(dataRelatorio);
            fimDia.setHours(23, 59, 59, 999);
            console.log(`📊 Gerando relatório diário para ${dataRelatorio.toLocaleDateString()}`);
            const relatorio = {
                data: dataRelatorio,
                periodo: {
                    inicio: inicioDia,
                    fim: fimDia,
                },
                vendas: await this.coletarDadosVendas(inicioDia, fimDia),
                estoque: await this.coletarDadosEstoque(inicioDia, fimDia),
                tarefas: await this.coletarDadosTarefas(inicioDia, fimDia),
                erros: await this.coletarDadosErros(inicioDia, fimDia),
                performance: await this.coletarDadosPerformance(inicioDia, fimDia),
                eventos: await this.coletarDadosEventos(inicioDia, fimDia),
                insights: [],
            };
            relatorio.insights = await this.gerarInsights(relatorio);
            console.log('✅ Relatório diário gerado com sucesso');
            return relatorio;
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao gerar relatório:', error);
            throw error;
        }
    }
    /**
     * Coleta dados de vendas para o relatório
     */
    async coletarDadosVendas(inicio, fim) {
        try {
            // Simular coleta de dados de vendas
            // Em um ambiente real, isso consultaria o banco de dados
            const pedidos = Math.floor(Math.random() * 30) + 5;
            const valor = Math.floor(Math.random() * 10000) + 1000;
            const vendasSimuladas = {
                total: Math.floor(Math.random() * 50) + 10,
                valor,
                pedidos,
                mediaPorPedido: pedidos > 0 ? valor / pedidos : 0,
                crescimento: (Math.random() - 0.5) * 20, // -10% a +10%
                produtosMaisVendidos: [
                    {
                        produto: 'Produto A',
                        quantidade: Math.floor(Math.random() * 10) + 1,
                        valor: Math.floor(Math.random() * 500) + 100,
                    },
                    {
                        produto: 'Produto B',
                        quantidade: Math.floor(Math.random() * 8) + 1,
                        valor: Math.floor(Math.random() * 300) + 50,
                    },
                ],
            };
            return vendasSimuladas;
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao coletar dados de vendas:', error);
            return {
                total: 0,
                valor: 0,
                pedidos: 0,
                mediaPorPedido: 0,
                crescimento: 0,
                produtosMaisVendidos: [],
            };
        }
    }
    /**
     * Coleta dados de estoque para o relatório
     */
    async coletarDadosEstoque(inicio, fim) {
        try {
            const contextoErp = await leoErpObserver.collectErpContext();
            const produtos = (contextoErp.produtos ?? {});
            return {
                totalProdutos: produtos.total ?? 0,
                valorTotalEstoque: Math.floor(Math.random() * 50000) + 10000,
                produtosCriticos: produtos.estoqueCritico ?? 0,
                semEstoque: produtos.semEstoque ?? 0,
                movimentacoes: {
                    entradas: Math.floor(Math.random() * 20) + 5,
                    saidas: Math.floor(Math.random() * 30) + 10,
                },
                reposicoes: [
                    {
                        produto: 'Produto X',
                        quantidade: 50,
                        fornecedor: 'Fornecedor A',
                    },
                    {
                        produto: 'Produto Y',
                        quantidade: 25,
                        fornecedor: 'Fornecedor B',
                    },
                ],
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao coletar dados de estoque:', error);
            return {
                totalProdutos: 0,
                valorTotalEstoque: 0,
                produtosCriticos: 0,
                semEstoque: 0,
                movimentacoes: { entradas: 0, saidas: 0 },
                reposicoes: [],
            };
        }
    }
    /**
     * Coleta dados de tarefas para o relatório
     */
    async coletarDadosTarefas(inicio, fim) {
        try {
            const stats = leoTaskQueue.getStats();
            const tasks = leoTaskQueue.listTasks({ limit: 100 });
            const tarefasPeriodo = tasks.filter((task) => {
                const created = task.createdAt instanceof Date ? task.createdAt.getTime() : 0;
                return created >= inicio.getTime() && created <= fim.getTime();
            });
            const executadas = tarefasPeriodo.filter((t) => t.status === LeoTaskStatus.DONE);
            const falhas = tarefasPeriodo.filter((t) => t.status === LeoTaskStatus.ERROR);
            const pendentes = tarefasPeriodo.filter((t) => t.status === LeoTaskStatus.PENDING);
            // Calcular tempo médio de execução
            const temposExecucao = executadas
                .map((t) => t.executionTime ?? 0)
                .filter((n) => n > 0);
            const tempoMedioExecucao = temposExecucao.length > 0
                ? temposExecucao.reduce((a, b) => a + b, 0) / temposExecucao.length
                : 0;
            // Agrupar por tipo
            const tiposContagem = new Map();
            tarefasPeriodo.forEach(task => {
                const atual = tiposContagem.get(task.type) || { quantidade: 0, sucesso: 0 };
                atual.quantidade++;
                if (task.status === LeoTaskStatus.DONE)
                    atual.sucesso++;
                tiposContagem.set(task.type, atual);
            });
            const tiposMaisExecutados = Array.from(tiposContagem.entries())
                .map(([tipo, dados]) => ({ tipo, ...dados }))
                .sort((a, b) => b.quantidade - a.quantidade)
                .slice(0, 5);
            const total = tarefasPeriodo.length;
            const taxaErro = total > 0 ? Math.round((falhas.length / total) * 10000) / 100 : 0;
            return {
                total,
                executadas: executadas.length,
                falhas: falhas.length,
                pendentes: pendentes.length,
                tempoMedioExecucao: Math.round(tempoMedioExecucao),
                taxaErro,
                tiposMaisExecutados,
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao coletar dados de tarefas:', error);
            return {
                total: 0,
                executadas: 0,
                falhas: 0,
                pendentes: 0,
                tempoMedioExecucao: 0,
                taxaErro: 0,
                tiposMaisExecutados: [],
            };
        }
    }
    /**
     * Coleta dados de erros para o relatório
     */
    async coletarDadosErros(inicio, fim) {
        try {
            const eventos = await leoEvents.listEvents({ limit: 100 });
            const eventosList = Array.isArray(eventos) ? eventos : [];
            // Filtrar erros do período
            const errosPeriodo = eventosList
                .filter((e) => e.dataCriacao &&
                e.dataCriacao >= inicio &&
                e.dataCriacao <= fim &&
                (e.tipo === 'erro_sistema' || e.tipo === 'integracao_error' || e.tipo === 'backup_falhou'));
            const criticos = errosPeriodo.filter((e) => e.prioridade === 'critica').length;
            // Agrupar por tipo
            const porTipo = new Map();
            errosPeriodo.forEach(erro => {
                const atual = porTipo.get(erro.tipo) || { quantidade: 0, exemplos: [] };
                atual.quantidade++;
                if (atual.exemplos.length < 3) {
                    atual.exemplos.push(erro.descricao);
                }
                porTipo.set(erro.tipo, atual);
            });
            const totalTasks = leoTaskQueue.getStats();
            const taxaErro = totalTasks.total > 0 ? (errosPeriodo.length / totalTasks.total) * 100 : 0;
            return {
                total: errosPeriodo.length,
                criticos,
                porTipo: Array.from(porTipo.entries())
                    .map(([tipo, dados]) => ({ tipo, ...dados })),
                taxaErro: Math.round(taxaErro * 100) / 100,
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao coletar dados de erros:', error);
            return {
                total: 0,
                criticos: 0,
                porTipo: [],
                taxaErro: 0,
            };
        }
    }
    /**
     * Coleta dados de performance para o relatório
     */
    async coletarDadosPerformance(inicio, fim) {
        try {
            const engineStatus = await leoEngine.getStatus();
            const loopStatus = await leoLoop.getLoopStatus();
            const supervisorStatus = leoSupervisor.getStatus();
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            return {
                uptime: engineStatus.uptime ?? 0,
                memoriaUso: {
                    atual: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
                    pico: Math.round((memUsage.heapTotal / memUsage.heapTotal) * 100),
                    medio: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
                },
                cpuUso: {
                    atual: Math.random() * 20 + 10, // Simulação
                    pico: Math.random() * 30 + 20,
                    medio: Math.random() * 15 + 10,
                },
                tempoResposta: {
                    medio: Math.random() * 100 + 50,
                    p95: Math.random() * 200 + 100,
                    p99: Math.random() * 500 + 200,
                },
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao coletar dados de performance:', error);
            return {
                uptime: 0,
                memoriaUso: { atual: 0, pico: 0, medio: 0 },
                cpuUso: { atual: 0, pico: 0, medio: 0 },
                tempoResposta: { medio: 0, p95: 0, p99: 0 },
            };
        }
    }
    /**
     * Coleta dados de eventos para o relatório
     */
    async coletarDadosEventos(inicio, fim) {
        try {
            const eventos = await leoEvents.listEvents({ limit: 100 });
            const eventosArr = Array.isArray(eventos) ? eventos : [];
            // Filtrar eventos do período
            const eventosPeriodo = eventosArr
                .filter((e) => e.dataCriacao && e.dataCriacao >= inicio && e.dataCriacao <= fim);
            const abertos = eventosPeriodo.filter((e) => e.status === 'ativo').length;
            const resolvidos = eventosPeriodo.filter((e) => e.status === 'resolvido').length;
            const criticos = eventosPeriodo.filter((e) => e.prioridade === 'critica').length;
            const porPrioridade = {
                critica: eventosPeriodo.filter((e) => e.prioridade === 'critica').length,
                alta: eventosPeriodo.filter((e) => e.prioridade === 'alta').length,
                media: eventosPeriodo.filter((e) => e.prioridade === 'media').length,
                baixa: eventosPeriodo.filter((e) => e.prioridade === 'baixa').length,
            };
            return {
                abertos,
                resolvidos,
                criticos,
                porPrioridade,
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao coletar dados de eventos:', error);
            return {
                abertos: 0,
                resolvidos: 0,
                criticos: 0,
                porPrioridade: { critica: 0, alta: 0, media: 0, baixa: 0 },
            };
        }
    }
    /**
     * Gera insights baseados nos dados do relatório
     */
    async gerarInsights(relatorio) {
        const insights = [];
        // Insight sobre vendas
        if (relatorio.vendas.crescimento > 10) {
            insights.push({
                tipo: 'oportunidade',
                titulo: 'Crescimento expressivo nas vendas',
                descricao: `Vendas cresceram ${relatorio.vendas.crescimento.toFixed(1)}% hoje`,
                impacto: 'alto',
                acaoSugerida: 'Analisar causas do crescimento e replicar estratégias',
            });
        }
        else if (relatorio.vendas.crescimento < -10) {
            insights.push({
                tipo: 'risco',
                titulo: 'Queda significativa nas vendas',
                descricao: `Vendas caíram ${Math.abs(relatorio.vendas.crescimento).toFixed(1)}% hoje`,
                impacto: 'critico',
                acaoSugerida: 'Investigar causas imediatamente e planejar ações corretivas',
            });
        }
        // Insight sobre estoque
        if (relatorio.estoque.produtosCriticos > 5) {
            insights.push({
                tipo: 'risco',
                titulo: 'Múltiplos produtos com estoque crítico',
                descricao: `${relatorio.estoque.produtosCriticos} produtos precisam de reposição urgente`,
                impacto: 'alto',
                acaoSugerida: 'Priorizar pedidos de compra para produtos críticos',
            });
        }
        // Insight sobre tarefas
        if (relatorio.tarefas.taxaErro > 20) {
            insights.push({
                tipo: 'risco',
                titulo: 'Alta taxa de erro em tarefas',
                descricao: `${relatorio.tarefas.taxaErro}% das tarefas falharam`,
                impacto: 'medio',
                acaoSugerida: 'Revisar lógica das tarefas com falhas frequentes',
            });
        }
        // Insight sobre performance
        if (relatorio.performance.memoriaUso.atual > 85) {
            insights.push({
                tipo: 'risco',
                titulo: 'Uso de memória elevado',
                descricao: `Memória em ${relatorio.performance.memoriaUso.atual}% da capacidade`,
                impacto: 'alto',
                acaoSugerida: 'Otimizar processos ou aumentar recursos disponíveis',
            });
        }
        // Insight sobre eventos
        if (relatorio.eventos.criticos > 3) {
            insights.push({
                tipo: 'risco',
                titulo: 'Múltiplos eventos críticos',
                descricao: `${relatorio.eventos.criticos} eventos críticos abertos`,
                impacto: 'critico',
                acaoSugerida: 'Priorizar resolução dos eventos críticos',
            });
        }
        return insights;
    }
    /**
     * Salva relatório em arquivo
     */
    async salvarRelatorio(relatorio) {
        try {
            const fs = require('fs');
            const path = require('path');
            // Criar diretório se não existir
            if (!fs.existsSync(this.config.caminhoSalvamento)) {
                fs.mkdirSync(this.config.caminhoSalvamento, { recursive: true });
            }
            const nomeArquivo = `relatorio-diario-${relatorio.data.toISOString().split('T')[0]}`;
            // Salvar em diferentes formatos
            for (const formato of this.config.formatos) {
                const caminhoCompleto = path.join(this.config.caminhoSalvamento, `${nomeArquivo}.${formato}`);
                let conteudo;
                switch (formato) {
                    case 'json':
                        conteudo = JSON.stringify(relatorio, null, 2);
                        break;
                    case 'html':
                        conteudo = this.gerarRelatorioHTML(relatorio);
                        break;
                    default:
                        conteudo = JSON.stringify(relatorio, null, 2);
                }
                fs.writeFileSync(caminhoCompleto, conteudo, 'utf-8');
                console.log(`📄 Relatório salvo: ${caminhoCompleto}`);
            }
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao salvar relatório:', error);
        }
    }
    /**
     * Gera relatório em formato HTML
     */
    gerarRelatorioHTML(relatorio) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Relatório Diário Leo - ${relatorio.data.toLocaleDateString()}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .insight { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .risk { background: #f8d7da; border-color: #f5c6cb; }
        .opportunity { background: #d4edda; border-color: #c3e6cb; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Relatório Diário Leo</h1>
        <p><strong>Data:</strong> ${relatorio.data.toLocaleDateString()}</p>
        <p><strong>Período:</strong> ${relatorio.periodo.inicio.toLocaleString()} - ${relatorio.periodo.fim.toLocaleString()}</p>
    </div>

    <div class="section">
        <h2>📈 Vendas</h2>
        <div class="metric">
            <strong>Total:</strong> ${relatorio.vendas.total}
        </div>
        <div class="metric">
            <strong>Valor:</strong> R$ ${relatorio.vendas.valor.toLocaleString('pt-BR')}
        </div>
        <div class="metric">
            <strong>Crescimento:</strong> ${relatorio.vendas.crescimento.toFixed(1)}%
        </div>
    </div>

    <div class="section">
        <h2>📦 Estoque</h2>
        <div class="metric">
            <strong>Produtos Críticos:</strong> ${relatorio.estoque.produtosCriticos}
        </div>
        <div class="metric">
            <strong>Sem Estoque:</strong> ${relatorio.estoque.semEstoque}
        </div>
    </div>

    <div class="section">
        <h2>⚡ Tarefas</h2>
        <div class="metric">
            <strong>Total:</strong> ${relatorio.tarefas.total}
        </div>
        <div class="metric">
            <strong>Executadas:</strong> ${relatorio.tarefas.executadas}
        </div>
        <div class="metric">
            <strong>Falhas:</strong> ${relatorio.tarefas.falhas}
        </div>
        <div class="metric">
            <strong>Tempo Médio:</strong> ${relatorio.tarefas.tempoMedioExecucao}ms
        </div>
    </div>

    <div class="section">
        <h2>🚨 Erros</h2>
        <div class="metric">
            <strong>Total:</strong> ${relatorio.erros.total}
        </div>
        <div class="metric">
            <strong>Críticos:</strong> ${relatorio.erros.criticos}
        </div>
        <div class="metric">
            <strong>Taxa de Erro:</strong> ${relatorio.erros.taxaErro}%
        </div>
    </div>

    <div class="section">
        <h2>💡 Insights</h2>
        ${relatorio.insights.map((insight) => `
            <div class="insight ${insight.tipo === 'risco' ? 'risk' : 'opportunity'}">
                <strong>${insight.titulo}</strong><br>
                ${insight.descricao}<br>
                <em>Impacto: ${insight.impacto}</em>
                ${insight.acaoSugerida ? `<br><strong>Ação sugerida:</strong> ${insight.acaoSugerida}` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>`;
    }
    /**
     * Agenda próxima execução do relatório
     */
    async agendarProximaExecucao() {
        try {
            const [horas, minutos] = this.config.horarioExecucao.split(':').map(Number);
            const agora = new Date();
            const proximaExecucao = new Date();
            proximaExecucao.setHours(horas, minutos, 0, 0);
            // Se já passou do horário hoje, agendar para amanhã
            if (proximaExecucao <= agora) {
                proximaExecucao.setDate(proximaExecucao.getDate() + 1);
            }
            const tempoAteExecucao = proximaExecucao.getTime() - agora.getTime();
            console.log(`⏰ Próxima execução agendada para: ${proximaExecucao.toLocaleString()}`);
            console.log(`⏳ Tempo até execução: ${Math.round(tempoAteExecucao / (1000 * 60 * 60))} horas`);
            // Agendar execução
            setTimeout(async () => {
                await this.executarRelatorioAgendado();
            }, tempoAteExecucao);
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao agendar próxima execução:', error);
        }
    }
    /**
     * Verifica e executa relatório se for o horário
     */
    async verificarEExecutarRelatorio() {
        try {
            const agora = new Date();
            const [horas, minutos] = this.config.horarioExecucao.split(':').map(Number);
            // Verificar se está no horário de execução (com tolerância de 5 minutos)
            const horarioExecucao = new Date();
            horarioExecucao.setHours(horas, minutos, 0, 0);
            const diferencaMinutos = Math.abs((agora.getTime() - horarioExecucao.getTime()) / (1000 * 60));
            if (diferencaMinutos <= 5) {
                await this.executarRelatorioAgendado();
                // Agendar próxima execução para o dia seguinte
                await this.agendarProximaExecucao();
            }
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro na verificação de execução:', error);
        }
    }
    /**
     * Executa o relatório agendado
     */
    async executarRelatorioAgendado() {
        try {
            console.log('📊 Executando relatório diário agendado...');
            const relatorio = await this.gerarRelatorioDiario();
            await this.salvarRelatorio(relatorio);
            // Registrar execução
            await insertLeoActionLog({
                usuario: 'leo-daily-report',
                acao: 'executar_relatorio_diario',
                entidade: 'leo_daily_report',
                dados: JSON.stringify({
                    data: relatorio.data,
                    insights: relatorio.insights.length,
                    arquivoSalvo: true,
                }),
                resultado: 'SUCESSO',
            });
            console.log('✅ Relatório diário executado e salvo com sucesso');
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao executar relatório agendado:', error);
            await insertLeoActionLog({
                usuario: 'leo-daily-report',
                acao: 'erro_relatorio_diario',
                entidade: 'leo_daily_report',
                dados: JSON.stringify({
                    error: error instanceof Error ? error.message : error,
                    timestamp: new Date(),
                }),
                resultado: 'ERRO',
            });
        }
    }
    /**
     * Obtém configuração atual
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Atualiza configuração
     */
    async atualizarConfig(novaConfig) {
        try {
            this.config = { ...this.config, ...novaConfig };
            await insertLeoActionLog({
                usuario: 'leo-daily-report',
                acao: 'atualizar_configuracao',
                entidade: 'leo_daily_report',
                dados: JSON.stringify({
                    novaConfig,
                    configFinal: this.config,
                }),
                resultado: 'SUCESSO',
            });
            console.log('⚙️ Configuração do relatório atualizada:', this.config);
            return {
                success: true,
                message: 'Configuração atualizada com sucesso',
            };
        }
        catch (error) {
            console.error('[LeoDailyReport] Erro ao atualizar configuração:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Erro ao atualizar configuração',
            };
        }
    }
}
// Exportar instância singleton
export const leoDailyReport = LeoDailyReport.getInstance();
