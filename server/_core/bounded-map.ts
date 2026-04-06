/**
 * Map com proteção contra overflow de memória
 * 
 * Implementa limite máximo e cleanup automático (FIFO/LRU)
 * Previne memory leaks em long-running processes
 */

export class BoundedMap<K, V> {
  private map = new Map<K, V>();
  private _maxSize: number;
  private accessOrder: K[] = [];

  constructor(maxSize: number = 1000) {
    if (maxSize <= 0) {
      throw new Error('maxSize deve ser maior que 0');
    }
    this._maxSize = maxSize;
  }

  /**
   * Obtém valor e atualiza ordem de acesso (LRU)
   */
  get(key: K): V | undefined {
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
  set(key: K, value: V): void {
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
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Remove item específico
   */
  delete(key: K): boolean {
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
  clear(): void {
    this.map.clear();
    this.accessOrder = [];
  }

  /**
   * Obtém tamanho atual
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Obtém tamanho máximo
   */
  get maxSize(): number {
    return this._maxSize;
  }

  /**
   * Itera sobre os itens
   */
  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  /**
   * Itera sobre as chaves
   */
  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  /**
   * Itera sobre os valores
   */
  values(): IterableIterator<V> {
    return this.map.values();
  }

  /**
   * Executa função para cada entrada
   */
  forEach(callbackfn: (value: V, key: K, map: BoundedMap<K, V>) => void): void {
    this.map.forEach((value, key) => callbackfn(value, key, this));
  }

  /**
   * Converte para array
   */
  toArray(): [K, V][] {
    return Array.from(this.map.entries());
  }

  /**
   * Remove itens expirados baseados em função
   */
  prune(predicate: (key: K, value: V) => boolean): number {
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
  private evictOldest(): void {
    if (this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder[0];
      this.map.delete(oldestKey);
      this.accessOrder.shift();
    }
  }

  /**
   * Move chave para o fim (recentemente acessado)
   */
  private moveToEnd(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Obtém estatísticas do Map
   */
  getStats(): {
    size: number;
    maxSize: number;
    utilization: number;
  } {
    return {
      size: this.map.size,
      maxSize: this._maxSize,
      utilization: this.map.size / this._maxSize,
    };
  }
}
