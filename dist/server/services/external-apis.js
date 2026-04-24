/**
 * Serviço de APIs Externas com Circuit Breaker
 *
 * Protege chamadas para APIs externas com:
 * - Timeout configurável
 * - Limites de erro
 * - Fallback automático
 * - Monitoramento de saúde
 */
import { CircuitBreaker } from '../infra/circuit-breaker.js';
import { logInfo, logWarn } from '../_core/logger.js';
/**
 * Serviço de Frete com Circuit Breaker
 */
export class FreteService {
    static circuitBreaker = new CircuitBreaker('frete', {
        timeout: 5000,
        errorThreshold: 5,
        resetTimeout: 30000,
        fallback: async () => ({
            valor: 0,
            prazo: 7,
            transportadora: 'Correios',
            modalidade: 'Padrão',
        })
    });
    static async calcularFrete(request) {
        logInfo('Calculando frete', { origem: request.origem, destino: request.destino, peso: request.peso });
        const result = await this.circuitBreaker.fire(async () => {
            const valor = request.peso * 0.1;
            const prazo = Math.ceil(request.peso / 10000 * 3);
            return {
                valor: Number(valor.toFixed(2)),
                prazo,
                transportadora: 'Transportadora XYZ',
                modalidade: 'Rodoviário',
            };
        });
        return result;
    }
    static getCircuitBreakerState() {
        return this.circuitBreaker.getStats();
    }
}
/**
 * Serviço de CEP com Circuit Breaker
 */
export class CepService {
    static circuitBreaker = new CircuitBreaker('cep', {
        timeout: 5000,
        errorThreshold: 5,
        resetTimeout: 30000,
        fallback: async () => ({
            cep: '00000000',
            logradouro: 'Logradouro não encontrado',
            bairro: 'Bairro não encontrado',
            cidade: 'Cidade não encontrada',
            estado: 'UF',
            ibge: '0000000',
        })
    });
    static async consultarCep(cep) {
        logInfo('Consultando CEP', { cep });
        const result = await this.circuitBreaker.fire(async () => {
            // Simulação de chamada à API de CEP
            // Em produção, aqui seria a chamada real à API dos Correios ou similar
            // Simulação de resposta baseada no CEP
            if (cep.startsWith('0')) {
                return {
                    cep,
                    logradouro: 'Rua das Américas',
                    bairro: 'Centro',
                    cidade: 'São Paulo',
                    estado: 'SP',
                    ibge: '3550308',
                };
            }
            return {
                cep,
                logradouro: 'Avenida Principal',
                bairro: 'Centro',
                cidade: 'Rio de Janeiro',
                estado: 'RJ',
                ibge: '3304557',
            };
        });
        return result;
    }
    static getCircuitBreakerState() {
        return this.circuitBreaker.getStats();
    }
}
/**
 * Serviço de Clima com Circuit Breaker
 */
export class ClimaService {
    static circuitBreaker = new CircuitBreaker('clima', {
        timeout: 5000,
        errorThreshold: 5,
        resetTimeout: 30000,
        fallback: async () => ({
            temperatura: 25,
            umidade: 60,
            descricao: 'Dados não disponíveis',
            previsao: 'Sem previsão',
        })
    });
    static async obterClima(request) {
        logInfo('Obtendo clima', {
            request: request,
            cidade: request.cidade,
            estado: request.estado
        });
        const result = await this.circuitBreaker.fire(async () => {
            // Simulação de chamada à API de clima
            // Em produção, aqui seria a chamada real à API de clima
            // Simulação baseada na cidade
            if (request.cidade.toLowerCase().includes('são paulo')) {
                return {
                    temperatura: 22 + Math.random() * 5,
                    umidade: 65 + Math.random() * 15,
                    descricao: 'Nublado com chuvas isoladas',
                    previsao: 'Possibilidade de chuvas à tarde',
                };
            }
            return {
                temperatura: 28 + Math.random() * 3,
                umidade: 70 + Math.random() * 10,
                descricao: 'Ensolarado com nuvens dispersas',
                previsao: 'Temp estável sem mudanças significativas',
            };
        });
        return result;
    }
    static getCircuitBreakerState() {
        return this.circuitBreaker.getStats();
    }
}
/**
 * Serviço de Rastreamento com Circuit Breaker
 */
export class RastreamentoService {
    static circuitBreaker = new CircuitBreaker('rastreamento', {
        timeout: 5000,
        errorThreshold: 5,
        resetTimeout: 30000,
        fallback: async () => ({
            status: 'Desconhecido',
            localizacao: 'Não disponível',
            data: new Date().toISOString(),
            historico: [],
        })
    });
    static async rastrearEncomenda(request) {
        logInfo('Rastreando encomenda', { codigo: request.codigo });
        const result = await this.circuitBreaker.fire(async () => {
            // Simulação de chamada à API de rastreamento
            // Em produção, aqui seria a chamada real aos Correios ou transportadora
            // Simulação baseada no código
            const now = new Date();
            const historico = [
                {
                    data: new Date(now.getTime() - 86400000).toISOString(), // Ontem
                    status: 'Em trânsito',
                    localizacao: 'Centro de distribuição SP',
                },
                {
                    data: new Date(now.getTime() - 43200000).toISOString(), // Ontem à tarde
                    status: 'Postado',
                    localizacao: 'Agência de origem',
                },
            ];
            return {
                status: 'Em trânsito',
                localizacao: 'Centro de distribuição SP',
                data: now.toISOString(),
                historico,
            };
        });
        return result;
    }
    static getCircuitBreakerState() {
        return this.circuitBreaker.getStats();
    }
}
/**
 * Gerenciador unificado para APIs externas
 */
export class ExternalApiManager {
    /**
     * Verifica saúde de todas as APIs externas
     */
    static async checkAllApisHealth() {
        const results = {
            frete: await FreteService.getCircuitBreakerState(),
            cep: await CepService.getCircuitBreakerState(),
            clima: await ClimaService.getCircuitBreakerState(),
            rastreamento: await RastreamentoService.getCircuitBreakerState(),
        };
        const allHealthy = Object.values(results).every((state) => {
            const s = state;
            return Number(s?.failureRate ?? 0) < 50 && !s?.isOpen;
        });
        logInfo('Saúde das APIs externas', {
            allHealthy,
            ...results
        });
        return {
            healthy: allHealthy,
            apis: results,
            timestamp: new Date(),
        };
    }
    /**
     * Reseta todos os circuit breakers
     */
    static resetAllCircuits() {
        logWarn('Resetando todos os Circuit Breakers das APIs externas');
        // Importar o CircuitBreakerManager para reset
        const { CircuitBreakerManager } = require('../infra/circuit-breaker');
        CircuitBreakerManager.resetCircuitBreaker('frete-api');
        CircuitBreakerManager.resetCircuitBreaker('cep-api');
        CircuitBreakerManager.resetCircuitBreaker('clima-api');
        CircuitBreakerManager.resetCircuitBreaker('rastreamento-api');
    }
    /**
     * Obtém estatísticas detalhadas
     */
    static getDetailedStats() {
        const { CircuitBreakerManager } = require('../infra/circuit-breaker');
        return {
            circuitBreakers: CircuitBreakerManager.listCircuitBreakers(),
            timestamp: new Date(),
            uptime: process.uptime(),
        };
    }
}
