/**
 * Módulo de gerenciamento de cache
 * 
 * Este módulo inicializa e gerencia o cache in-memory do sistema
 */

import { memoryCache, initCache } from "./memory-cache.js";
import { getCacheStats } from "./safe-cache.js";
import { redisManager } from "../infra/redis.js";
import express from "express";
import { requireAdmin } from "./requireAdmin.js";
import { logInfo, logWarning, logError } from "./service-logger.js";

// Intervalo de limpeza do cache em segundos
const CLEANUP_INTERVAL = 300; // 5 minutos

/**
 * Inicializa o sistema de cache
 */
export function initCacheSystem(): void {
  // Validar conexão Redis antes de inicializar
  validateRedisConnection();
  
  // Inicializar cache com TTL padrão e limpeza periódica
  initCache({
    defaultTtl: 30, // 30 segundos por padrão
    cleanupInterval: CLEANUP_INTERVAL
  });
  
  logInfo("Sistema de cache inicializado", {
    payload: { cleanupInterval: CLEANUP_INTERVAL }
  });
}

/**
 * Valida conexão com Redis no boot
 */
async function validateRedisConnection(): Promise<void> {
  try {
    const isHealthy = await redisManager.isConnected();
    
    if (isHealthy) {
      logInfo("Redis conectado com sucesso", { service: "cache-manager" });
    } else {
      logWarning("CACHE_WARNING", "Redis não disponível, operando sem cache distribuído", { service: "cache-manager" });
    }
  } catch (error) {
    logError("CACHE_ERROR", "Falha ao validar conexão Redis", { service: "cache-manager", error: error as Error });
  }
}

/**
 * Cria um router Express para gerenciar o cache via API
 */
export function createCacheRouter(): express.Router {
  const router = express.Router();
  
  // Obter estatísticas do cache
  router.get("/stats", requireAdmin, (req, res) => {
    const memStats = memoryCache.getStats();
    const safeStats = getCacheStats();
    
    res.json({
      memory: {
        ...memStats,
        hitRatePercentage: Math.round(memStats.hitRate * 100)
      },
      safe: {
        ...safeStats,
        hitRatePercentage: Math.round(safeStats.hitRate * 100)
      },
      timestamp: new Date().toISOString()
    });
  });
  
  // Limpar todo o cache
  router.post("/clear", requireAdmin, (req, res) => {
    memoryCache.clear();
    logInfo("Cache limpo manualmente", { 
      payload: { user: (req as { user?: { name?: string } }).user?.name || "admin" }
    });
    res.json({ success: true, message: "Cache limpo com sucesso" });
  });
  
  // Limpar cache expirado
  router.post("/cleanup", requireAdmin, (req, res) => {
    memoryCache.cleanup();
    logInfo("Cache expirado limpo manualmente", { 
      payload: { user: (req as { user?: { name?: string } }).user?.name || "admin" }
    });
    res.json({ success: true, message: "Cache expirado limpo com sucesso" });
  });
  
  // Invalidar cache por padrão
  router.post("/invalidate", requireAdmin, (req, res) => {
    const { pattern, service, tenantId } = req.body;
    
    if (!pattern && !service) {
      return res.status(400).json({ error: "Padrão ou serviço não informado" });
    }
    
    try {
      let count = 0;
      
      if (pattern) {
        count = memoryCache.invalidatePattern(pattern);
        logInfo(`Cache invalidado por padrão: ${pattern}`, { 
          payload: { user: (req as { user?: { name?: string } }).user?.name || "admin", count }
        });
      } else if (service && tenantId) {
        const servicePattern = new RegExp(`^${service}:.*:${tenantId}`);
        count = memoryCache.invalidatePattern(servicePattern);
        logInfo(`Cache invalidado por serviço: ${service} (tenant: ${tenantId})`, { 
          payload: { user: (req as { user?: { name?: string } }).user?.name || "admin", count }
        });
      }
      
      res.json({ 
        success: true, 
        invalidated: count, 
        message: `${count} itens invalidados` 
      });
    } catch (error) {
      logWarning("Cache invalidation error", "Erro ao invalidar cache", { 
        payload: { error: String(error), pattern, service, tenantId }
      });
      res.status(500).json({ 
        error: "Erro ao invalidar cache", 
        details: String(error) 
      });
    }
  });
  
  return router;
}