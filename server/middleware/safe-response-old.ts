/**
 * Safe Response Middleware
 * 
 * Previne "Cannot call write after a stream was destroyed"
 * Implementa regras de response único e safe transaction
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../_core/logger.js';

interface SafeResponse extends Response {
  _isDestroyed?: boolean;
  _responseSent?: boolean;
}

// Exportar funções utilitárias
// Arquivo legado - semáforos movidos para safe-response.ts
