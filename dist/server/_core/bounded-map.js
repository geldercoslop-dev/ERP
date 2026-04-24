/**
 * Map com proteção contra overflow de memória
 *
 * Implementa limite máximo e cleanup automático (FIFO/LRU)
 * Previne memory leaks em long-running processes
 */
import { ValidationError } from './errors/typed-errors.js';
export class BoundedMap {
    map = new Map();
    _maxSize;
    accessOrder = [];
    constructor(maxSize = 1000) {
        if (maxSize <= 0) {
            throw new ValidationError('maxSize deve ser maior que 0');
        }
        this._maxSize = maxSize;
    }
    /**
     * Obtém valor e atualiza ordem de acesso (LRU)
     */
    get(key) {
        const value = this.map.get(key);
        if (value !== undefined) {
            // Mover para o fim (recentemente acessado)
            this.moveToEnd(key);
        }
        return value;
    }
    /**
     * Define valor com proteção contra overflow
     */
    set(key, value) {
        if (this.map.size >= this._maxSize && !this.map.has(key)) {
            // Remover o mais antigo (FIFO) ou menos usado (LRU)
            this.evictOldest();
        }
        this.map.set(key, value);
        this.moveToEnd(key);
    }
    /**
     * Verifica se chave existe
     */
    has(key) {
        return this.map.has(key);
    }
    /**
     * Remove item específico
     */
    delete(key) {
        const deleted = this.map.delete(key);
        if (deleted) {
            // Remover da ordem de acesso
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
        }
        return deleted;
    }
    /**
     * Limpa todos os itens
     */
    clear() {
        this.map.clear();
        this.accessOrder = [];
    }
    /**
     * Obtém tamanho atual
     */
    get size() {
        return this.map.size;
    }
    /**
     * Obtém tamanho máximo
     */
    get maxSize() {
        return this._maxSize;
    }
    /**
     * Itera sobre os itens
     */
    entries() {
        return this.map.entries();
    }
    /**
     * Itera sobre as chaves
     */
    keys() {
        return this.map.keys();
    }
    /**
     * Itera sobre os valores
     */
    values() {
        return this.map.values();
    }
    /**
     * Executa função para cada entrada
     */
    forEach(callbackfn) {
        this.map.forEach((value, key) => callbackfn(value, key, this));
    }
    /**
     * Converte para array
     */
    toArray() {
        return Array.from(this.map.entries());
    }
    /**
     * Remove itens expirados baseados em função
     */
    prune(predicate) {
        let removed = 0;
        for (const [key, value] of this.map.entries()) {
            if (predicate(key, value)) {
                this.delete(key);
                removed++;
            }
        }
        return removed;
    }
    /**
     * Remove o mais antigo (FIFO)
     */
    evictOldest() {
        if (this.accessOrder.length > 0) {
            const oldestKey = this.accessOrder[0];
            this.map.delete(oldestKey);
            this.accessOrder.shift();
        }
    }
    /**
     * Move chave para o fim (recentemente acessado)
     */
    moveToEnd(key) {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }
    /**
     * Obtém estatísticas do Map
     */
    getStats() {
        return {
            size: this.map.size,
            maxSize: this._maxSize,
            utilization: this.map.size / this._maxSize,
        };
    }
}
