import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

type Payload = Record<string, unknown>;

/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * Validates JWT tokens and extracts user info
 * Sets req.user and req.userId
 */

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as Payload;
    
    // DEBUG: Log decoded token
    console.log('[AUTH-MIDDLEWARE] Token decoded:', {
      decoded,
      hasUserId: !!decoded.userId,
      hasTenantId: !!decoded.tenantId,
      userId: decoded.userId,
      tenantId: decoded.tenantId
    });
    
    // Attach user info to request
    (req as any).user = decoded;
    (req as any).userId = typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId as string);
    
    console.log('[AUTH-MIDDLEWARE] Request after auth:', {
      userId: (req as any).userId,
      user: (req as any).user,
      headers: {
        authorization: authHeader?.substring(0, 50) + '...'
      }
    });
    
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
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No token, continue without auth
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as Payload;
    
    (req as any).user = decoded;
    (req as any).userId = typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId as string);
    
    next();
  } catch (error: unknown) {
    // Invalid token, continue without auth
    next();
  }
}
