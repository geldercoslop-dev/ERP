/**
 * OpenTelemetry Configuration
 * Instrumentação completa para HTTP, MySQL e Redis
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { 
  SemanticResourceAttributes
} from '@opentelemetry/semantic-conventions';

// Inicialização do OpenTelemetry
export function initializeOpenTelemetry(): NodeSDK {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: 'erp-api',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Instrumentações específicas que queremos
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-mysql': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();
  console.log('🔍 OpenTelemetry initialized with HTTP, MySQL and Redis instrumentation');
  
  return sdk;
}

// Middleware para criar spans HTTP personalizados
export function createHttpSpanMiddleware() {
  return (req: any, res: any, next: any) => {
    const tracer = trace.getTracer('erp-http');
    const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'user_agent': req.get('user-agent'),
        'remote_addr': req.ip || req.connection.remoteAddress,
      },
    });

    // Adicionar traceId ao request para logging
    req.traceId = span.spanContext().traceId;
    req.span = span;

    // Finalizar span quando response terminar
    res.on('finish', () => {
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response_content_length': res.get('content-length'),
      });

      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
    });

    // Propagar contexto para async operations
    context.with(trace.setSpan(context.active(), span), next);
  };
}

// Função auxiliar para criar spans de banco de dados
export function createDatabaseSpan(operation: string, query: string) {
  const tracer = trace.getTracer('erp-database');
  return tracer.startSpan(`db.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'mysql',
      'db.operation': operation,
      'db.statement': query.substring(0, 1000), // Limitar tamanho
      'db.sql.table': extractTableName(query),
    },
  });
}

// Função auxiliar para spans Redis
export function createRedisSpan(operation: string, key?: string) {
  const tracer = trace.getTracer('erp-redis');
  return tracer.startSpan(`redis.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'redis',
      'redis.command': operation,
      ...(key && { 'redis.key': key }),
    },
  });
}

// Extrair nome da tabela do query SQL
function extractTableName(query: string): string {
  const patterns = [
    /FROM\s+`?(\w+)`?/i,
    /INSERT\s+INTO\s+`?(\w+)`?/i,
    /UPDATE\s+`?(\w+)`?/i,
    /DELETE\s+FROM\s+`?(\w+)`?/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) return match[1];
  }

  return 'unknown';
}

// Wrapper para medir operações de banco com span
export async function measureDatabaseOperation<T>(
  operation: string,
  query: string,
  fn: () => Promise<T>
): Promise<T> {
  const span = createDatabaseSpan(operation, query);
  
  try {
    const result = await fn();
    
    span.setAttributes({
      'db.rows_affected': Array.isArray(result) ? result.length : 1,
      'db.success': true,
    });
    
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    
    span.setAttributes({
      'db.success': false,
      'error.message': error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  } finally {
    span.end();
  }
}

// Wrapper para operações Redis
export async function measureRedisOperation<T>(
  operation: string,
  key: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const span = createRedisSpan(operation, key);
  
  try {
    const result = await fn();
    
    span.setAttributes({
      'redis.success': true,
    });
    
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    
    span.setAttributes({
      'redis.success': false,
      'error.message': error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  } finally {
    span.end();
  }
}

// Exportar traceId atual para logging
export function getCurrentTraceId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  return activeSpan?.spanContext().traceId;
}

// Configuração para Pino logger
export const pinoConfig = {
  mixin: () => {
    const traceId = getCurrentTraceId();
    return traceId ? { traceId } : {};
  },
};
