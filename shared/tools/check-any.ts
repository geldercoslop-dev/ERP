import { join } from "node:path";
import { logMessage } from "../utils/logger.js";
import { processWorkspaceFile, walkTypeScriptFiles } from "../services/file.service.js";
import { runSnapshots, type ProcessOutput } from "../core/processor.js";

function parseFlags(argv: string[]): { strict: boolean; selfTest: boolean } {
  return {
    strict: argv.includes("--strict"),
    selfTest: argv.includes("--self-test"),
  };
}

function createProcessOutput(): ProcessOutput {
  return {
    total: 0,
    errors: 0,
  };
}

function mergeResult(target: ProcessOutput, current: ProcessOutput): void {
  target.total += current.total;
  target.errors += current.errors;
}

export function runCheckAny(argv: string[], cwd: string): number {
  const flags = parseFlags(argv);
  const roots = [join(cwd, "server"), join(cwd, "src")];
  const summary = createProcessOutput();

  if (flags.selfTest) {
    const snapshots = runSnapshots();
    if (!snapshots.ok) {
      logMessage("error", "Falha ao executar snapshots", { error: snapshots.error });
      return 1;
    }

    logMessage("info", "Snapshots executados", {
      passed: snapshots.data.passed,
      failed: snapshots.data.failed,
      details: snapshots.data.details,
    });
  }

  for (const root of roots) {
    const files = walkTypeScriptFiles(root);
    for (const filePath of files) {
      const fileResult = processWorkspaceFile(cwd, filePath);
      if (!fileResult.result.ok) {
        summary.errors += 1;
        logMessage("error", "Falha ao processar arquivo", {
          filePath,
          error: fileResult.result.error,
        });
        continue;
      }

      for (const match of fileResult.result.data.matches) {
        logMessage("info", "Encontrado any", { match });
      }

      mergeResult(summary, {
        total: fileResult.result.data.total,
        errors: fileResult.result.data.errors,
      });
    }
  }

  logMessage("info", "Processamento concluido", {
    total: summary.total,
    errors: summary.errors,
  });

  if (flags.strict && summary.total > 0) {
    return 1;
  }

  return summary.errors > 0 ? 1 : 0;
}
