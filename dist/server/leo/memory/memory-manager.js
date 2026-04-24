/**
 * Gerenciador de Memória do LEO - Leo Memory Manager
 *
 * Controla uso de memória do agente LEO para evitar memory leaks
 * Implementa limites, TTL e limpeza automática
 */
import { logInfo, logError, logWarn } from '../../_core/logger.js';
/**
 * Gerenciador de memória para o agente LEO
 */
class LeoMemoryManager {
    static instance;
    memory = new Map();
    config;
    cleanupTimer;
    stats;
    startTime;
    constructor() {
        this.config = {
            maxItems: 10000, // Máximo 10k itens
            maxMemoryMB: 256, // Máximo 256MB
            defaultTTL: 24 * 60 * 60 * 1000, // 24 horas
            cleanupInterval: 5 * 60 * 1000, // 5 minutos
            compressionThreshold: 10240, // 10KB para comprimir
        };
        this.stats = this.createEmptyStats();
        this.startTime = new Date();
        this.startCleanupTimer();
    }
    static getInstance() {
        if (!LeoMemoryManager.instance) {
            LeoMemoryManager.instance = new LeoMemoryManager();
        }
        return LeoMemoryManager.instance;
    }
    createEmptyStats() {
        return {
            totalItems: 0,
            totalSizeBytes: 0,
            maxItems: this.config.maxItems,
            maxMemoryBytes: this.config.maxMemoryMB * 1024 * 1024,
            itemsByType: {},
        };
    }
    /**
     * Adiciona item à memória
     */
    set(key, type, data, options) {
        try {
            // Verificar limites antes de adicionar
            if (!this.checkLimits()) {
                this.enforceLimits();
            }
            // Calcular tamanho do item
            const sizeBytes = this.calculateSize(data);
            const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
            if (sizeBytes > maxMemoryBytes / 10) {
                logWarn('Item muito grande para memória do LEO', {
                    key,
                    type,
                    sizeBytes,
                    maxMemoryBytes,
                });
                return false;
            }
            // Criar item de memória
            const item = {
                id: key,
                type,
                data,
                createdAt: new Date(),
                lastAccessed: new Date(),
                accessCount: 1,
                sizeBytes,
                ttl: options?.ttl || this.config.defaultTTL,
            };
            // Adicionar ao mapa
            this.memory.set(key, item);
            // Atualizar estatísticas
            this.updateStats();
            logInfo('Item adicionado à memória do LEO', {
                key,
                type,
                sizeBytes,
                totalItems: this.stats.totalItems,
                totalMemoryMB: Math.round(this.stats.totalSizeBytes / 1024 / 1024 * 100) / 100,
            });
            return true;
        }
        catch (error) {
            logError('Falha ao adicionar item à memória do LEO', error, {
                key,
                type,
            });
            return false;
        }
    }
    /**
     * Obtém item da memória
     */
    get(key) {
        try {
            const item = this.memory.get(key);
            if (!item) {
                return null;
            }
            // Verificar TTL
            if (this.isExpired(item)) {
                this.memory.delete(key);
                this.updateStats();
                return null;
            }
            // Atualizar acesso
            item.lastAccessed = new Date();
            item.accessCount++;
            return item.data;
        }
        catch (error) {
            logError('Falha ao obter item da memória do LEO', error, {
                key,
            });
            return null;
        }
    }
    /**
     * Remove item da memória
     */
    delete(key) {
        try {
            const deleted = this.memory.delete(key);
            if (deleted) {
                this.updateStats();
                logInfo('Item removido da memória do LEO', { key });
            }
            return deleted;
        }
        catch (error) {
            logError('Falha ao remover item da memória do LEO', error, {
                key,
            });
            return false;
        }
    }
    /**
     * Verifica se item existe
     */
    has(key) {
        const item = this.memory.get(key);
        if (!item) {
            return false;
        }
        // Verificar TTL
        if (this.isExpired(item)) {
            this.memory.delete(key);
            this.updateStats();
            return false;
        }
        return true;
    }
    /**
     * Limpa toda a memória
     */
    clear() {
        try {
            const itemCount = this.memory.size;
            this.memory.clear();
            this.stats = this.createEmptyStats();
            logInfo('Memória do LEO limpa', {
                itemsRemoved: itemCount,
            });
        }
        catch (error) {
            logError('Falha ao limpar memória do LEO', error);
        }
    }
    /**
     * Obtém estatísticas da memória
     */
    getStats() {
        this.updateStats();
        return { ...this.stats };
    }
    /**
     * Executa limpeza manual
     */
    async cleanup() {
        const startTime = Date.now();
        try {
            logInfo('Iniciando limpeza manual da memória do LEO');
            const result = await this.performCleanup();
            const duration = Date.now() - startTime;
            logInfo('Limpeza da memória do LEO concluída', {
                ...result,
                duration,
            });
            return result;
        }
        catch (error) {
            logError('Falha na limpeza da memória do LEO', error);
            return {
                itemsRemoved: 0,
                memoryFreed: 0,
                itemsCompressed: 0,
                compressionSaved: 0,
                duration: Date.now() - startTime,
            };
        }
    }
    /**
     * Verifica se item expirou
     */
    isExpired(item) {
        if (!item.ttl)
            return false;
        const elapsed = Date.now() - item.createdAt.getTime();
        return elapsed > item.ttl;
    }
    /**
     * Calcula tamanho aproximado do item
     */
    calculateSize(data) {
        try {
            if (data === null || data === undefined)
                return 0;
            const jsonString = JSON.stringify(data);
            // Tamanho aproximado: string length * 2 (UTF-16) + overhead do objeto
            return jsonString.length * 2 + 100;
        }
        catch (error) {
            // Fallback: estimativa baseada em tipo
            return 1024; // 1KB padrão
        }
    }
    /**
     * Verifica se limites foram excedidos
     */
    checkLimits() {
        const itemsExceeded = this.memory.size >= this.config.maxItems;
        const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
        const memoryExceeded = this.stats.totalSizeBytes >= maxMemoryBytes;
        return !itemsExceeded && !memoryExceeded;
    }
    /**
     * Força cumprimento dos limites
     */
    enforceLimits() {
        const itemsToRemove = Math.max(0, this.memory.size - this.config.maxItems + 1000);
        if (itemsToRemove > 0) {
            // Remover itens mais antigos ou menos acessados
            const sortedItems = Array.from(this.memory.entries())
                .sort((a, b) => {
                // Prioridade: 1. TTL expirado, 2. Menos acessado, 3. Mais antigo
                const aExpired = this.isExpired(a[1]);
                const bExpired = this.isExpired(b[1]);
                if (aExpired && !bExpired)
                    return -1;
                if (!aExpired && bExpired)
                    return 1;
                if (a[1].accessCount !== b[1].accessCount) {
                    return a[1].accessCount - b[1].accessCount;
                }
                return a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime();
            });
            let itemsRemoved = 0;
            for (let i = 0; i < itemsToRemove && i < sortedItems.length; i++) {
                const [key] = sortedItems[i];
                this.memory.delete(key);
                itemsRemoved++;
            }
            logInfo('Limites de memória do LEO enforcement', {
                itemsRemoved,
                maxItems: this.config.maxItems,
                currentItems: this.memory.size,
            });
        }
        const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
        if (this.stats.totalSizeBytes > maxMemoryBytes) {
            // Remover itens maiores até atingir limite
            const sortedBySize = Array.from(this.memory.entries())
                .sort((a, b) => b[1].sizeBytes - a[1].sizeBytes);
            let currentSize = this.stats.totalSizeBytes;
            let removed = 0;
            for (const [key, item] of sortedBySize) {
                if (currentSize <= maxMemoryBytes * 0.8)
                    break; // Manter 80% do máximo
                this.memory.delete(key);
                currentSize -= item.sizeBytes;
                removed++;
            }
            logInfo('Limite de memória do LEO enforcement', {
                itemsRemoved: removed,
                memoryFreed: this.stats.totalSizeBytes - currentSize,
                maxMemoryMB: this.config.maxMemoryMB,
                currentMemoryMB: Math.round(currentSize / 1024 / 1024 * 100) / 100,
            });
        }
        this.updateStats();
    }
    /**
     * Executa limpeza automática
     */
    async performCleanup() {
        const startTime = Date.now();
        let itemsRemoved = 0;
        let memoryFreed = 0;
        let itemsCompressed = 0;
        let compressionSaved = 0;
        const keysToDelete = [];
        // 1. Remover itens expirados
        for (const [key, item] of Array.from(this.memory.entries())) {
            if (this.isExpired(item)) {
                keysToDelete.push(key);
                itemsRemoved++;
                memoryFreed += item.sizeBytes;
            }
        }
        // 2. Remover itens se ainda acima dos limites
        keysToDelete.forEach(key => this.memory.delete(key));
        // 3. Se ainda acima dos limites, remover menos acessados
        if (!this.checkLimits()) {
            const sortedByAccess = Array.from(this.memory.entries())
                .sort((a, b) => a[1].accessCount - b[1].accessCount);
            const remainingCapacity = this.config.maxItems - this.memory.size;
            const toRemove = Math.max(0, sortedByAccess.length - remainingCapacity);
            for (let i = 0; i < toRemove; i++) {
                const [key, item] = sortedByAccess[i];
                this.memory.delete(key);
                itemsRemoved++;
                memoryFreed += item.sizeBytes;
            }
        }
        this.updateStats();
        return {
            itemsRemoved,
            memoryFreed,
            itemsCompressed,
            compressionSaved,
            duration: Date.now() - startTime,
        };
    }
    /**
     * Atualiza estatísticas
     */
    updateStats() {
        this.stats.totalItems = this.memory.size;
        this.stats.totalSizeBytes = 0;
        this.stats.oldestItem = undefined;
        this.stats.newestItem = undefined;
        this.stats.itemsByType = {};
        let oldestTime = Date.now();
        let newestTime = 0;
        for (const item of Array.from(this.memory.values())) {
            this.stats.totalSizeBytes += item.sizeBytes;
            // Contar por tipo
            this.stats.itemsByType[item.type] = (this.stats.itemsByType[item.type] || 0) + 1;
            // Encontrar mais antigo e mais novo
            if (item.createdAt.getTime() < oldestTime) {
                oldestTime = item.createdAt.getTime();
                this.stats.oldestItem = item.createdAt;
            }
            if (item.createdAt.getTime() > newestTime) {
                newestTime = item.createdAt.getTime();
                this.stats.newestItem = item.createdAt;
            }
        }
    }
    /**
     * Inicia timer de limpeza automática
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.performCleanup();
            }
            catch (error) {
                logError('Erro na limpeza automática da memória do LEO', error);
            }
        }, this.config.cleanupInterval);
    }
    /**
     * Para timer de limpeza
     */
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    /**
     * Obtém uptime do gerenciador
     */
    getUptime() {
        return Date.now() - this.startTime.getTime();
    }
    /**
     * Configura limites
     */
    configure(config) {
        this.config = { ...this.config, ...config };
        this.stats.maxItems = this.config.maxItems;
        this.stats.maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
        // Reiniciar timer se intervalo mudou
        if (config.cleanupInterval) {
            this.startCleanupTimer();
        }
        logInfo('Configuração do gerenciador de memória do LEO atualizada', {
            config: this.config,
        });
    }
    /**
     * Exporta dados para backup
     */
    export() {
        return Array.from(this.memory.entries()).map(([key, item]) => ({ key, item }));
    }
    /**
     * Importa dados de backup
     */
    import(data) {
        let imported = 0;
        for (const { key, item } of data) {
            if (this.set(key, item.type, item.data, { ttl: item.ttl })) {
                imported++;
            }
        }
        logInfo('Dados importados para memória do LEO', {
            totalItems: data.length,
            imported,
        });
        return imported;
    }
}
// Exportar instância singleton
export const leoMemoryManager = LeoMemoryManager.getInstance();
// Exportar funções de utilidade
export function setLeoMemory(key, type, data, options) {
    return leoMemoryManager.set(key, type, data, options);
}
export function getLeoMemory(key) {
    return leoMemoryManager.get(key);
}
export function deleteLeoMemory(key) {
    return leoMemoryManager.delete(key);
}
export function hasLeoMemory(key) {
    return leoMemoryManager.has(key);
}
export function getLeoMemoryStats() {
    return leoMemoryManager.getStats();
}
export async function cleanupLeoMemory() {
    return leoMemoryManager.cleanup();
}
