# Phase 6: Hardening Recommendations

## Critical Security Hardening Actions

### 1. Password Security Hardening

#### Immediate Actions (24 hours)
```typescript
// Replace hardcoded admin password in server/_core/auth-detection.ts
const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || generateSecurePassword();
```

#### Implementation Steps:
1. Generate cryptographically secure default password
2. Implement forced password change on first login
3. Add password complexity requirements:
   - Minimum 12 characters
   - Include uppercase, lowercase, numbers, special characters
   - Password history tracking (prevent reuse)
   - Account lockout after failed attempts

### 2. JWT Secret Management

#### Environment Configuration
```bash
# Generate secure secrets
JWT_ACCESS_SECRET=$(openssl rand -base64 64 | tr -d '\n')
JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')
APP_SECRET=$(openssl rand -base64 64 | tr -d '\n')
SESSION_SECRET=$(openssl rand -base64 64 | tr -d '\n')
```

#### Code Changes Required:
```typescript
// Remove fallback secrets in server/middleware/auth.middleware.ts
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const decoded = jwt.verify(token, process.env.JWT_SECRET) as Payload;
```

### 3. TypeScript Security Configuration

#### Enable Strict Mode
```json
// tsconfig.json
{
  "compilerOptions": {
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

#### Migration Strategy:
1. Enable strict mode incrementally
2. Fix type errors by category:
   - Add explicit types for function parameters
   - Fix return type annotations
   - Handle null/undefined cases
   - Remove `any` types

### 4. Input Validation Enhancement

#### Implement Comprehensive Validation
```typescript
// Add validation middleware
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128)
});

// Apply to all endpoints
export const validateInput = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
  };
};
```

### 5. Security Headers Enhancement

#### Complete CSP Implementation
```typescript
// server/_core/index.ts - Replace current CSP config
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  })
);
```

### 6. Error Handling Security

#### Sanitize Error Responses
```typescript
// server/_core/index.ts - Enhance error handling
const sanitizeError = (error: Error, isProduction: boolean) => {
  if (isProduction) {
    return {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    };
  }
  
  return {
    message: error.message,
    stack: error.stack
  };
};

// Remove sensitive SQL details from logs
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const sanitizedError = sanitizeError(err, isProduction);
  
  // Log full error for debugging
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path
  });
  
  res.status(500).json({
    error: sanitizedError,
    requestId: req.requestId
  });
});
```

### 7. Database Security Hardening

#### Connection Security
```typescript
// Implement connection pooling with security
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000
};
```

#### Query Parameterization
```typescript
// Ensure all queries use parameterized statements
const getUserById = async (id: number) => {
  const [rows] = await db.execute(
    'SELECT id, username, email FROM users WHERE id = ?',
    [id]
  );
  return rows;
};
```

### 8. Session Security Enhancement

#### Secure Cookie Configuration
```typescript
// server/_core/cookies.ts
export const getSessionCookieOptions = (isProduction: boolean) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict' as const,
  maxAge: ONE_YEAR_MS,
  path: '/',
  domain: isProduction ? '.yourdomain.com' : undefined
});
```

### 9. API Rate Limiting Enhancement

#### Intelligent Rate Limiting
```typescript
// Enhanced rate limiting with user-based limits
const createUserRateLimiter = () => {
  return createRedisRateLimitMiddleware({
    name: 'user-api',
    windowMs: 60 * 1000,
    max: (req) => {
      // Different limits for different user roles
      if (req.user?.role === 'admin') return 200;
      if (req.user?.role === 'premium') return 100;
      return 50;
    },
    keyGenerator: (req) => `user:${req.user?.id || req.ip}`,
    shouldApply: (req) => !req.path.startsWith('/api/health')
  });
};
```

### 10. Monitoring and Alerting

#### Security Event Monitoring
```typescript
// Security event tracking
export const trackSecurityEvent = async (event: {
  type: 'login_attempt' | 'password_change' | 'privilege_escalation' | 'suspicious_activity';
  userId?: number;
  ip: string;
  userAgent?: string;
  details?: Record<string, any>;
}) => {
  await securityLogger.info('Security event', {
    ...event,
    timestamp: new Date().toISOString(),
    requestId: nanoid()
  });
  
  // Trigger alerts for critical events
  if (event.type === 'privilege_escalation' || event.type === 'suspicious_activity') {
    await sendSecurityAlert(event);
  }
};
```

## Implementation Timeline

### Week 1: Critical Fixes
- [ ] Replace hardcoded passwords
- [ ] Rotate JWT secrets
- [ ] Remove secret fallbacks
- [ ] Enable CSP headers

### Week 2: Type Safety & Validation
- [ ] Enable TypeScript strict mode
- [ ] Fix all type errors
- [ ] Implement input validation
- [ ] Sanitize error responses

### Week 3: Advanced Security
- [ ] Enhanced rate limiting
- [ ] Security monitoring
- [ ] Database hardening
- [ ] Session security

### Week 4: Testing & Documentation
- [ ] Security testing
- [ ] Penetration testing
- [ ] Documentation updates
- [ ] Team training

## Success Metrics

### Security Metrics
- Zero hardcoded secrets
- 100% type coverage
- All inputs validated
- Security events tracked

### Performance Metrics
- <100ms response time for authenticated requests
- <1% error rate
- 99.9% uptime
- No security incidents

### Compliance Metrics
- OWASP Top 10 compliance
- Security headers score: A+
- Type safety score: 100%
- Test coverage: >90%
