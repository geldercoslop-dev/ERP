import jwt from 'jsonwebtoken';
/**
 * AUTHENTICATION MIDDLEWARE
 *
 * Validates JWT tokens and extracts user info
 * Sets req.user and req.userId
 */
function getJwtSecret() {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        throw new Error('JWT_SECRET não configurado');
    }
    return secret;
}
export function authMiddleware(req, res, next) {
    try {
        const authReq = req;
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
        // Attach user info to request
        authReq.user = decoded;
        authReq.userId = typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId);
        next();
    }
    catch (error) {
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
export function optionalAuthMiddleware(req, res, next) {
    try {
        const authReq = req;
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
        authReq.user = decoded;
        authReq.userId = typeof decoded.userId === 'number' ? decoded.userId : parseInt(decoded.userId);
        next();
    }
    catch (error) {
        // Invalid token, continue without auth
        next();
    }
}
