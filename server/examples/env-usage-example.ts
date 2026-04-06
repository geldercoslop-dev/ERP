/**
 * Example: Using Validated Environment in LEO Services
 * 
 * This demonstrates how to safely use environment variables
 * throughout the TOOLS → SERVICES → DATABASE architecture
 * 
 * @file server/examples/env-usage-example.ts
 */

import { env, config, isProduction, getDatabaseUrl, getRedisOptions } from '../config/env.js';
import { createLogger } from '../infra/structured-logger.js';

const logger = createLogger('env-example');

// ============================================================================
// EXAMPLE 1: Using Env in Service Layer (SERVICES)
// ============================================================================

/**
 * Example service that depends on environment config
 * No direct process.env access - use validated env instead
 */
export class UserAuthService {
  private logger = createLogger('user-auth');

  /**
   * Constructor: Settings should come from validated env, not raw process.env
   */
  constructor() {
    // ✅ GOOD: Use validated, typed config
    const jwtSecret = env.JWT_ACCESS_SECRET;  // Type: string, guaranteed 32+ chars
    const jwtExpiry = config.security.jwtExpiresIn;  // Type: string

    console.log(`🔐 Auth configured: ${jwtExpiry} expiry`);

    // ❌ BAD (anti-pattern): Raw process.env access
    // const secret = process.env.JWT_ACCESS_SECRET;  // Type: string | undefined
    // const token = sign(payload, secret!);  // ! is unsafe
  }

  /**
   * Method: Use typed env in business logic
   */
  validateToken(token: string): boolean {
    try {
      // ✅ GOOD: env.JWT_ACCESS_SECRET is guaranteed string, 32+ chars
      const decoded = this.decodeToken(token, env.JWT_ACCESS_SECRET);
      return !!decoded;
    } catch (error) {
      this.logger.error('Token validation failed', {
        metadata: { error: String(error) },
      });
      return false;
    }
  }

  private decodeToken(token: string, secret: string): object {
    // In real code, use jsonwebtoken.verify()
    return {};
  }
}

// ============================================================================
// EXAMPLE 2: Using Env in Tool Configuration (TOOLS)
// ============================================================================

/**
 * Tool: Database Connection (part of LEO TOOLS layer)
 */
export class DatabaseTool {
  private logger = createLogger('db-tool');
  private connectionUrl: string;

  constructor() {
    // ✅ GOOD: getDatabaseUrl() handles DATABASE_URL OR individual vars
    this.connectionUrl = getDatabaseUrl(env);
    
    // ✅ Log non-sensitive info (never log passwords)
    this.logger.info('Database configured', {
      metadata: {
        host: env.DATABASE_HOST,
        port: env.DATABASE_PORT,
        database: env.DATABASE_NAME,
        // ❌ NEVER log password
        // password: env.DATABASE_PASSWORD,
      },
    });
  }

  async connect(): Promise<void> {
    // Real implementation would use this.connectionUrl
    console.log(`Connecting to: ${this.connectionUrl}`);
  }
}

/**
 * Tool: Redis Connection (cache, queues, sessions)
 */
export class RedisTool {
  private logger = createLogger('redis-tool');
  private options: ReturnType<typeof getRedisOptions>;

  constructor() {
    // ✅ GOOD: getRedisOptions() returns properly typed config
    this.options = getRedisOptions(env);

    this.logger.info('Redis configured', {
      metadata: {
        host: this.options.host,
        port: this.options.port,
        hasPassword: !!this.options.password,
        // ❌ NEVER log password
        // password: this.options.password,
      },
    });
  }

  async connect(): Promise<void> {
    // Real implementation would use this.options
    console.log(`Connecting to Redis: ${this.options.host}:${this.options.port}`);
  }

  getOptions() {
    return this.options;
  }
}

// ============================================================================
// EXAMPLE 3: Conditional Logic Based on Environment
// ============================================================================

/**
 * Initialize different services based on NODE_ENV
 */
export function initializeServices() {
  const logger = createLogger('service-init');

  if (isProduction()) {
    logger.info('Production environment detected', {
      metadata: {
        enableTrace: true,
        enableMetrics: config.monitoring.enabled,
        enableBackup: config.backup.enabled,
      },
    });

    // Production-specific initialization
    // - Enable enhanced logging
    // - Enable metrics collection
    // - Setup backup jobs
    // - Enable rate limiting
    // - Enable CORS restrictions
  } else {
    logger.info('Development environment', {
      metadata: {
        corsOrigin: config.server.corsOrigin,
        logLevel: config.logging.level,
      },
    });

    // Development-specific initialization
    // - Relaxed CORS
    // - Verbose logging
    // - Hot reload enabled
  }
}

// ============================================================================
// EXAMPLE 4: Security Validation on Boot
// ============================================================================

/**
 * Boot-time validation (runs on server start)
 * Implements fail-fast pattern
 */
export function validateSecurityOnBoot(): void {
  const logger = createLogger('security-validation');

  // Check 1: JWT secret strength
  if (isProduction()) {
    const minChars = 64;
    const accessSecretLen = env.JWT_ACCESS_SECRET.length;
    const refreshSecretLen = env.JWT_REFRESH_SECRET.length;

    if (accessSecretLen < minChars) {
      logger.error('Security constraint violated', {
        metadata: {
          constraint: 'JWT_ACCESS_SECRET < 64 chars in production',
          current: accessSecretLen,
          required: minChars,
        },
      });
      process.exit(1);  // Fail fast
    }

    if (refreshSecretLen < minChars) {
      logger.error('Security constraint violated', {
        metadata: {
          constraint: 'JWT_REFRESH_SECRET < 64 chars in production',
          current: refreshSecretLen,
          required: minChars,
        },
      });
      process.exit(1);  // Fail fast
    }

    logger.info('Security validation passed', {
      metadata: {
        jwtAccessLen: accessSecretLen,
        jwtRefreshLen: refreshSecretLen,
        constraints: 'All secrets >= 64 chars',
      },
    });
  }

  // Check 2: Database connectivity info
  if (!env.DATABASE_URL) {
    logger.error('Database not configured', {
      metadata: {
        requiresField: 'DATABASE_URL',
      },
    });
    process.exit(1);
  }

  // Check 3: Redis connectivity (required for cache/queues)
  if (!env.REDIS_HOST) {
    logger.error('Redis not configured', {
      metadata: {
        requiresField: 'REDIS_HOST',
      },
    });
    process.exit(1);
  }

  logger.info('All security constraints validated', {
    metadata: {
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  });
}

// ============================================================================
// EXAMPLE 5: Middleware Using Validated Env
// ============================================================================

/**
 * Express middleware that uses validated env
 * Part of LEO request handling pipeline
 */
export function corsMiddleware() {
  const allowedOrigins = config.server.corsOrigin;

  return (req: any, res: any, next: any) => {
    const origin = req.headers.origin;

    if (isProduction()) {
      // Strict CORS in production
      if (origin === allowedOrigins) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } else {
      // Relaxed CORS in development
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    next();
  };
}

/**
 * Rate limiting middleware configured from env
 */
export function rateLimitMiddleware() {
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;

  return (req: any, res: any, next: any) => {
    // Real implementation would track requests per IP
    // For demo purposes:
    console.log(`Rate limit: ${maxRequests} requests per ${windowMs}ms`);
    next();
  };
}

// ============================================================================
// EXAMPLE 6: Configuration Consistency Pattern
// ============================================================================

/**
 * Demonstrates how to structure config for multiple environments
 */
export const serviceConfig = {
  // ✅ GOOD: Centralized config based on validated env
  database: {
    url: getDatabaseUrl(env),
    ssl: env.DATABASE_SSL,
    maxConnections: 10,
    pool: {
      min: 2,
      max: isProduction() ? 10 : 5,
    },
  },

  redis: {
    ...getRedisOptions(env),
    maxRetriesPerRequest: null,
    enableReadyCheck: isProduction(),
    enableOfflineQueue: !isProduction(),
  },

  jwt: {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },

  logging: {
    level: env.LOG_LEVEL,
    transport: isProduction()
      ? { target: 'pino/file', options: { destination: env.LOG_FILE } }
      : { target: 'pino-pretty', options: { colorize: true } },
  },

  security: {
    helmet: env.ENABLE_HELMET,
    cors: {
      origin: config.server.corsOrigin,
      credentials: true,
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX_REQUESTS,
    },
  },
};

// ============================================================================
// EXAMPLE 7: Initialization Pattern (Use in server/index.ts or main entry)
// ============================================================================

/**
 * Server bootstrap function
 * Order matters: validation → config → tools → services
 */
export async function bootstrapServer() {
  const logger = createLogger('bootstrap');

  try {
    logger.info('🚀 Starting application bootstrap', {
      metadata: {
        environment: env.NODE_ENV,
        port: env.PORT,
        timestamp: new Date().toISOString(),
      },
    });

    // Step 1: Validate security constraints (fail-fast)
    validateSecurityOnBoot();

    // Step 2: Initialize TOOLS layer
    const dbTool = new DatabaseTool();
    const redisTool = new RedisTool();

    await dbTool.connect();
    await redisTool.connect();

    // Step 3: Initialize SERVICES layer
    const authService = new UserAuthService();

    // Step 4: Setup middleware
    const corsMiddlewareHandler = corsMiddleware();
    const rateLimitHandler = rateLimitMiddleware();

    // Step 5: Start server
    const port = env.PORT;
    logger.info('✅ Bootstrap complete', {
      metadata: {
        port,
        database: 'connected',
        redis: 'connected',
        services: 'initialized',
      },
    });

    return {
      authService,
      dbTool,
      redisTool,
      middleware: {
        cors: corsMiddlewareHandler,
        rateLimit: rateLimitHandler,
      },
    };
  } catch (error) {
    logger.error('❌ Bootstrap failed', {
      metadata: {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    process.exit(1);
  }
}

// ============================================================================
// ANTI-PATTERNS TO AVOID
// ============================================================================

/**
 * ❌ BAD: Don't do this
 */
export function antiPatterns() {
  // ❌ Accessing process.env directly
  const secret = process.env.JWT_ACCESS_SECRET;  // Type: string | undefined
  if (secret) {  // Unsafe, need to check length too
    // ...
  }

  // ❌ Duplicating configuration logic
  const dbUrl = `mysql://${process.env.DB_USER}@${process.env.DB_HOST}`;
  // Should use: getDatabaseUrl(env)

  // ❌ No validation of environment
  const port = parseInt(process.env.PORT || '3000');  // Could be -1
  // Should use: env.PORT (already validated)

  // ❌ Unsafe defaults
  const secret2 = process.env.JWT_SECRET;
  // Should use: env.JWT_ACCESS_SECRET (required, no unsafe defaults)
}

/**
 * ✅ GOOD: Best practices
 */
export function bestPractices() {
  // ✅ Use validated env (typed, required, safe)
  const secret = env.JWT_ACCESS_SECRET;  // Type: string, 32+ chars guaranteed

  // ✅ Use helper functions
  const dbUrl = getDatabaseUrl(env);
  const redisOpts = getRedisOptions(env);

  // ✅ Check environment context
  if (isProduction()) {
    // Production-specific logic
  }

  // ✅ Use config accessors
  console.log(config.security.jwtAccessSecret);
  console.log(config.database.url);
  console.log(config.cache.redis.host);

  // ✅ Never log secrets
  logger.info('Service initialized', {
    metadata: {
      port: env.PORT,
      database: env.DATABASE_NAME,
      // NOT: password: env.DATABASE_PASSWORD
    },
  });
}
