import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../security/jwt-auth.js';
import { InfrastructureError } from '../_core/errors/typed-errors.js';

type AuthenticatedRequest = Request & {
  user?: Request['user'];
  userId?: number;
};

function isJWTPayload(value: unknown): value is JWTPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'userId' in value &&
    'tenantId' in value &&
    'email' in value &&
    'role' in value &&
    'sessionId' in value &&
    typeof (value as JWTPayload).userId === 'number' &&
    typeof (value as JWTPayload).tenantId === 'number' &&
    typeof (value as JWTPayload).email === 'string' &&
    typeof (value as JWTPayload).role === 'string' &&
    typeof (value as JWTPayload).sessionId === 'string'
  );
}

/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * Validates JWT tokens and extracts user info
 * Sets req.user and req.userId
 */

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new InfrastructureError('JWT_SECRET não configurado');
  }
  return secret;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authReq = req as AuthenticatedRequest;
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'No authorization header',
        message: 'Authorization token is required'
      });
      return;
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Invalid authorization format',
        message: 'Authorization header must be in format "Bearer <token>"'
      });
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, getJwtSecret());
    
    // Validate decoded token structure
    if (!isJWTPayload(decoded)) {
      res.status(401).json({
        success: false,
        error: 'Invalid token structure',
        message: 'Authentication failed'
      });
      return;
    }
    
    // Attach user info to request
    authReq.user = decoded as Request['user'];
    authReq.userId = decoded.userId;
    
    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      message: 'Authentication failed'
    });
  }
}

/**
 * OPTIONAL AUTH MIDDLEWARE
 * 
 * Allows requests without token but sets user info if token is present
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authReq = req as AuthenticatedRequest;
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No token, continue without auth
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, getJwtSecret());
    
    if (isJWTPayload(decoded)) {
      authReq.user = decoded as Request['user'];
      authReq.userId = decoded.userId;
    }
    
    next();
  } catch (error: unknown) {
    // Invalid token, continue without auth
    next();
  }
}
