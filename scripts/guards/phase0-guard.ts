import { execSync } from 'child_process'
import { format } from 'node:util'

const writeOut = (...args: unknown[]): void => {
  process.stdout.write(format(...args) + "\n");
};

const writeErr = (...args: unknown[]): void => {
  process.stderr.write(format(...args) + "\n");
};

let failed = false

function run(cmd: string) {
  try {
    const result = execSync(cmd, { stdio: 'pipe' }).toString()
    // Filter out lines that start with // or /*
    return result.split('\n')
      .filter((line: string) => !line.trim().startsWith('//') && !line.includes('/*'))
      .join('\n')
  } catch (e: unknown) {
    const err = e as { stdout?: unknown; stderr?: unknown; status?: unknown; message?: unknown }

    if (err.stdout) {
      const result = String(err.stdout)
      // Filter out lines that start with // or /*
      return result.split('\n')
        .filter((line: string) => !line.trim().startsWith('//') && !line.includes('/*'))
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

function check(name: string, result: string) {
  if (result.trim().length > 0) {
    writeErr(`❌ ${name} VIOLATION`)
    writeErr(result)
    failed = true
  } else {
    writeOut(`✔ ${name} OK`)
  }
}

writeOut('🔒 PHASE 0 GUARD START')

// BLOQUEAR ANY - padrões específicos
check(
  'ANY',
  run('findstr /s /n /i /c:": any" /c:" as any" /c:"<any>" /c:"any[]" server\\*')
)

// BLOQUEAR LEO → SERVICE - padrão específico de import, excluindo tools
check(
  'LEO SERVICE IMPORT',
  run('findstr /s /n /i "import .*Service" server\\leo\\* | findstr /v "\\tools\\"')
)

// BLOQUEAR FALLBACK TENANT
check(
  'TENANT FALLBACK',
  run('findstr /s /n /i "tenantId ||" server\\*')
)

// BLOQUEAR EXEC PERIGOSO - padrões específicos, excluindo scripts
check(
  'EXEC',
  run('findstr /s /n /i /c:"child_process" /c:"execSync" /c:"exec(" /c:"spawn(" server\\* | findstr /v "\\scripts\\"')
)

// CHECK EXTRA CRÍTICO - LEO chamando service
check(
  'LEO SERVICE CALL',
  run('findstr /s /n /i "Service" server\\leo\\*')
)

// BLOQUEAR LEO importando services diretamente
check(
  'LEO RELATIVE SERVICE IMPORT',
  run(`findstr /s /n /i "from '../../services.js" server\\leo\\*`)
)

// BLOQUEAR uso de process.env.TENANT_ID
check(
  'TENANT ENV FALLBACK',
  run('findstr /s /n /i "TENANT_ID" server\\*')
)

// BLOQUEAR tenantId fixo em 1
check(
  'TENANT FIXED VALUE',
  run('findstr /s /n /i "tenantId = 1" server\\*')
)

if (failed) {
  writeErr('\n🚨 PHASE 0 GUARD FAILED')
  process.exit(1)
} else {
  writeOut('\n✅ PHASE 0 GUARD PASSED')
}

