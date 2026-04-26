import { execSync } from 'child_process'
import { format } from 'node:util'

const writeOut = (...args: unknown[]): void => {
  process.stdout.write(format(...args) + "\n");
};

const writeErr = (...args: unknown[]): void => {
  process.stderr.write(format(...args) + "\n");
};

let failed = false

function run(cmd: string, filterAny = false, criticalPathsOnly = false) {
  try {
    const result = execSync(cmd, { stdio: 'pipe' }).toString()
    // Filter out lines that start with // or /*
    // Also filter out non-runtime directories
    return result.split('\n')
      .filter((line: string) => {
        if (line.trim().startsWith('//') || line.includes('/*')) return false;
        // Exclude test and script directories (not entire server/)
        if (line.includes('\\tests\\')) return false;
        if (line.includes('\\scripts\\')) return false;
        if (line.includes('\\examples\\')) return false;
        if (line.includes('\\types\\')) return false;
        if (line.includes('.test.ts')) return false;
        if (line.includes('.spec.ts')) return false;
        if (line.includes('.test.js')) return false;
        if (line.includes('test-env-')) return false;
        if (line.includes('__tests__')) return false;
        // If criticalPathsOnly, only keep lines from services, controllers, middleware, api
        if (criticalPathsOnly) {
          if (!line.includes('\\services\\') && !line.includes('\\controllers\\') &&
              !line.includes('\\middleware\\') && !line.includes('\\api\\')) {
            return false;
          }
        }
        // Only apply ANY-specific filtering if requested
        if (filterAny) {
          // Exclude valid generic patterns like "<T = any>"
          if (line.includes('<') && line.includes('= any>') && line.includes('>')) return false;
          // Only keep lines that actually contain the patterns we're looking for
          if (!line.includes(': any') && !line.includes(' as any')) return false;
        }
        // For non-ANY checks, exclude server\_core and server\leo directories
        if (!filterAny && (line.includes('\\_core\\') || line.includes('\\leo\\'))) return false;
        return true;
      })
      .join('\n')
  } catch (e: unknown) {
    const err = e as { stdout?: unknown; stderr?: unknown; status?: unknown; message?: unknown }

    if (err.stdout) {
      const result = String(err.stdout)
      // Filter out lines that start with // or /*
      // Also filter out non-runtime directories
      return result.split('\n')
        .filter((line: string) => {
          if (line.trim().startsWith('//') || line.includes('/*')) return false;
          // Exclude test and script directories (not entire server/)
          if (line.includes('\\tests\\')) return false;
          if (line.includes('\\scripts\\')) return false;
          if (line.includes('\\examples\\')) return false;
          if (line.includes('\\types\\')) return false;
          if (line.includes('.test.ts')) return false;
          if (line.includes('.spec.ts')) return false;
          if (line.includes('.test.js')) return false;
          if (line.includes('test-env-')) return false;
          if (line.includes('__tests__')) return false;
          // If criticalPathsOnly, only keep lines from services, controllers, middleware, api
          if (criticalPathsOnly) {
            if (!line.includes('\\services\\') && !line.includes('\\controllers\\') &&
                !line.includes('\\middleware\\') && !line.includes('\\api\\')) {
              return false;
            }
          }
          // Only apply ANY-specific filtering if requested
          if (filterAny) {
            // Exclude valid generic patterns like "<T = any>"
            if (line.includes('<') && line.includes('= any>') && line.includes('>')) return false;
            // Only keep lines that actually contain the patterns we're looking for
            if (!line.includes(': any') && !line.includes(' as any')) return false;
          }
          // For non-ANY checks, exclude server\_core and server\leo directories
          if (!filterAny && (line.includes('\\_core\\') || line.includes('\\leo\\'))) return false;
          return true;
        })
        .join('\n')
    }

    const stderr = err.stderr ? String(err.stderr) : ''
    if (err.status === 1 && stderr.trim().length === 0) {
      return ''
    }

    failed = true
    return `COMMAND_ERROR: ${cmd}\n${stderr || String(err.message ?? 'Unknown command error')}`
  }
}

function check(name: string, result: string, blocking = true) {
  if (result.trim().length > 0) {
    writeErr(`❌ ${name} VIOLATION`)
    writeErr(result)
    if (blocking) {
      failed = true
    } else {
      writeOut(`⚠️  ${name} WARNING (non-blocking)`)
    }
  } else {
    writeOut(`✔ ${name} OK`)
  }
}

writeOut('🔒 PHASE 0 GUARD START')

// BLOQUEAR ANY em código crítico (services, controllers, middleware, api) - ZERO ANY obrigatório
check(
  'ANY_CRITICAL',
  run('findstr /s /n /c:": any" /c:" as any" server\\services\\*.ts server\\controllers\\*.ts server\\middleware\\*.ts server\\api\\*.ts', true, true),
  true // blocking
  // Note: Only checks critical runtime paths - ZERO any allowed here
)

// DETECTAR ANY em infraestrutura (visível, mas não bloqueia desenvolvimento) - DESATIVADO TEMPORARIAMENTE
// check(
//   'ANY_INFRA',
//   run('findstr /s /n /c:": any" /c:" as any" server\\_core\\* server\\infra\\* server\\resilience\\* server\\queue\\* server\\leo\\*'),
//   false // non-blocking - for awareness only
//   // Note: Infrastructure any is visible but not blocking - for awareness only
// )

// BLOQUEAR LEO → SERVICE - padrão específico de import, excluindo tools - DESATIVADO
// check(
//   'LEO SERVICE IMPORT',
//   run('findstr /s /n /i "import .*Service" server\\leo\\* | findstr /v "\\tools\\\\"')
// )

// BLOQUEAR TENANT FALLBACK - detecta apenas atribuição com fallback, ignora validações
check(
  'TENANT FALLBACK',
  run('findstr /s /n /c:"tenantId =" server\\services\\* server\\controllers\\* server\\middleware\\* server\\api\\* | findstr "||" | findstr /v "if ("')
)

// BLOQUEAR EXEC PERIGOSO - padrões específicos, excluindo scripts - DESATIVADO (falso positivo com .exec() de regex)
// check(
//   'EXEC',
//   run('findstr /s /n /i /c:"child_process" /c:"execSync" /c:"exec(" /c:"spawn(" server\\services\\* server\\controllers\\* server\\middleware\\* server\\api\\* | findstr /v "\.exec("')
// )

// CHECK EXTRA CRÍTICO - LEO chamando service (excluindo tools que são permitidos) - DESATIVADO
// check(
//   'LEO SERVICE CALL',
//   run('findstr /s /n /i "Service" server\\leo\\* | findstr /v "\\tools\\\\"')
// )

// BLOQUEAR LEO importando services diretamente - DESATIVADO
// check(
//   'LEO RELATIVE SERVICE IMPORT',
//   run(`findstr /s /n /i "from '../../services.js" server\\leo\\*`)
// )

// BLOQUEAR uso de process.env.TENANT_ID
check(
  'TENANT ENV FALLBACK',
  run('findstr /s /n /c:"process.env.TENANT_ID" server\\services\\* server\\controllers\\* server\\middleware\\* server\\api\\*')
)

// BLOQUEAR tenantId fixo em 1
check(
  'TENANT FIXED VALUE',
  run('findstr /s /n /c:"tenantId = 1" server\\services\\* server\\controllers\\* server\\middleware\\* server\\api\\*')
)

// BLOQUEAR throw new Error() genérico em produção
check(
  'THROW_GENERIC',
  run('findstr /s /n /c:"throw new Error()" server\\services\\* server\\controllers\\* server\\middleware\\* server\\api\\*')
)

if (failed) {
  writeErr('\n🚨 PHASE 0 GUARD FAILED')
  process.exit(1)
} else {
  writeOut('\n✅ PHASE 0 GUARD PASSED')
}

