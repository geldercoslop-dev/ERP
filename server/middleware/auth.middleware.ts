import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

type Payload = Record<string, unknown>;
type AuthenticatedRequest = Request & {
  user?: Request['user'];
  userId?: number;
};

/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * Validates JWT tokens and extracts user info
 * Sets req.user and req.userId
 */

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET não configurado');
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
    const decoded = jwt.verify(token, getJwtSecret()) as Payload;
    
    // Attach user info to request
    authReq.user = decoded as unknown as Request['user'];
    authReq.userId = typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId as string);
    
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

    const decoded = jwt.verify(token, getJwtSecret()) as Payload;
    
    authReq.user = decoded as unknown as Request['user'];
    authReq.userId = typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId as string);
    
    next();
  } catch (error: unknown) {
    // Invalid token, continue without auth
    next();
  }
}
