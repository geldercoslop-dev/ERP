#!/usr/bin/env node
/**
 * check-any.mjs
 * Cross-platform replacement for: grep -rn "\bany\b" server/ --include="*.ts"
 *
 * Exit codes:
 *   --strict mode: exits 1 if any occurrence found, 0 if clean
 *   default mode:  always exits 0 (report only)
 */
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

/** @typedef {boolean} StrictModeFlag */
/** @typedef {number} CursorIndex */
/** @typedef {number} LineIndex */
/** @typedef {string} SourceLine */
/** @typedef {string} FilePath */
/** @typedef {string} SanitizedLine */
/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {[LineIndex, SourceLine]} LineEntry */

/**
 * @typedef {{
 *   inBlockComment: boolean,
 *   inTemplateLiteral: boolean
 * }} ParseState
 */

/**
 * @typedef {{
 *   sanitizedLine: SanitizedLine,
 *   newState: ParseState
 * }} SanitizeResult
 */

/**
 * @typedef {{
 *   message: string,
 *   context?: Record<string, unknown>
 * }} SafeError
 */

/** @type {StrictModeFlag} */
const strict = process.argv.includes("--strict");
const selfTest = process.argv.includes("--self-test");
const rootDir = process.cwd();
const roots = ["server", "src"].map((dir) => join(rootDir, dir));
const pattern = /\bany\b/g;

/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/**
 * @param {string} message
 * @param {Record<string, unknown>=} context
 * @returns {SafeError}
 */
function createSafeError(message, context) {
  return context ? { message, context } : { message };
}

/** @param {SafeError} safeError @returns {Error} */
function toError(safeError) {
  const suffix = safeError.context
    ? ` | context=${JSON.stringify(safeError.context)}`
    : "";
  return new Error(`${safeError.message}${suffix}`);
}

/** @param {unknown} value @returns {value is SafeError} */
function isSafeError(value) {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.message !== "string") {
    return false;
  }

  return value.context === undefined || isRecord(value.context);
}

/** @param {unknown} error @param {Record<string, unknown>=} context @returns {SafeError} */
function normalizeError(error, context) {
  if (isSafeError(error)) {
    if (context) {
      return createSafeError(error.message, { ...(error.context ?? {}), ...context });
    }
    return error;
  }

  if (error instanceof Error) {
    return createSafeError(error.message, context);
  }

  return createSafeError("Erro desconhecido", {
    ...(context ?? {}),
    rawError: String(error),
  });
}

/** @param {SafeError} safeError @returns {void} */
function logSafeError(safeError) {
  process.stderr.write(
    `${JSON.stringify(
      {
        level: "error",
        message: safeError.message,
        context: safeError.context ?? {},
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
}

/** @param {string} label @param {() => unknown} callback @returns {boolean} */
function expectControlledFailure(label, callback) {
  try {
    callback();
    logSafeError(
      createSafeError("Falha de robustez: erro esperado não ocorreu", {
        label,
      })
    );
    return false;
  } catch (error) {
    const safeError = normalizeError(error, { label });
    logSafeError(safeError);
    return true;
  }
}

/** @returns {void} */
function runRobustnessChecks() {
  const emptyLineResult = sanitizeLine("", createInitialState());
  if (!isSanitizeResult(emptyLineResult)) {
    throw toError(
      createSafeError("Teste de robustez falhou para linha vazia", {
        phase: "empty-line",
      })
    );
  }

  const undefinedLineHandled = expectControlledFailure("linha-undefined", () => {
    const invalidLine = undefined;
    sanitizeLine(invalidLine, createInitialState());
  });

  const corruptedStateHandled = expectControlledFailure("estado-corrompido", () => {
    const corruptedState = { inBlockComment: "sim", inTemplateLiteral: false };
    sanitizeLine("const a = 1;", corruptedState);
  });

  if (!undefinedLineHandled || !corruptedStateHandled) {
    throw toError(
      createSafeError("Teste de robustez não passou", {
        undefinedLineHandled,
        corruptedStateHandled,
      })
    );
  }

  process.stdout.write("Robustez validada: linha undefined, linha vazia e estado corrompido.\n");
}

/** @param {unknown} value @param {string} label @returns {value is string} */
function isString(value, label) {
  if (typeof value !== "string") {
    throw toError(
      createSafeError("Valor deve ser string", {
        label,
        receivedType: typeof value,
      })
    );
  }
  return true;
}

/** @param {unknown} value @returns {value is ParseState} */
function isParseState(value) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.inBlockComment === "boolean" &&
    typeof value.inTemplateLiteral === "boolean"
  );
}

/** @param {unknown} value @returns {value is SanitizeResult} */
function isSanitizeResult(value) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sanitizedLine === "string" &&
    isParseState(value.newState)
  );
}

/** @param {unknown} value @returns {value is LineEntry} */
function isLineEntry(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }

  const [index, line] = value;
  return Number.isInteger(index) && index >= 0 && typeof line === "string";
}

/** @param {SanitizedLine} sanitizedLine @param {ParseState} newState @returns {SanitizeResult} */
function createSanitizeResult(sanitizedLine, newState) {
  const result = {
    sanitizedLine,
    newState,
  };

  if (!isSanitizeResult(result)) {
    throw toError(
      createSafeError("Contrato inválido de sanitizeLine", {
        sanitizedLineType: typeof sanitizedLine,
      })
    );
  }

  return result;
}

/** @returns {ParseState} */
function createInitialState() {
  return {
    inBlockComment: false,
    inTemplateLiteral: false,
  };
}

/**
 * Remove comentarios e strings mantendo apenas codigo analisavel para detectar `any` real.
 * @param {SourceLine} line
 * @param {ParseState} state
 * @returns {SanitizeResult}
 */
function sanitizeLine(line, state) {
  isString(line, "line");
  if (!isParseState(state)) {
    throw toError(
      createSafeError("Estado de parsing inválido", {
        stateType: typeof state,
      })
    );
  }

  let newState = {
    inBlockComment: state.inBlockComment,
    inTemplateLiteral: state.inTemplateLiteral,
  };

  /** @type {SanitizedLine} */
  let result = "";
  /** @type {CursorIndex} */
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (i < line.length) {
    const ch = line[i];
    const next = i + 1 < line.length ? line[i + 1] : "";

    if (newState.inBlockComment) {
      if (ch === "*" && next === "/") {
        newState = { ...newState, inBlockComment: false };
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      i += 1;
      continue;
    }

    if (newState.inTemplateLiteral) {
      if (ch === "`") {
        newState = { ...newState, inTemplateLiteral: false };
      }
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      break;
    }

    if (ch === "/" && next === "*") {
      newState = { ...newState, inBlockComment: true };
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      i += 1;
      continue;
    }

    if (ch === "`") {
      newState = { ...newState, inTemplateLiteral: true };
      i += 1;
      continue;
    }

    result += ch;
    i += 1;
  }

  return createSanitizeResult(result, newState);
}

/** @param {FilePath} dir @returns {Promise<FilePath[]>} */
async function walk(dir) {
  isString(dir, "dir");

  const folderName = dir.split(/[/\\]/).pop();
  if (folderName === "node_modules" || folderName === "dist") {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      files.push(full);
    }
  }
  return files;
}

/** @returns {Promise<number>} */
async function main() {
  if (selfTest) {
    runRobustnessChecks();
    return 0;
  }

  /** @type {FilePath[]} */
  const files = [];

  for (const root of roots) {
    try {
      files.push(...(await walk(root)));
    } catch {
      // Ignora roots inexistentes para manter comportamento cross-platform resiliente.
    }
  }

  /** @type {number} */
  let total = 0;

  for (const file of files) {
    const src = await readFile(file, "utf8");
    const lines = src.split("\n");
    let state = createInitialState();

    for (const entry of lines.entries()) {
      if (!isLineEntry(entry)) {
        throw toError(
          createSafeError("Entrada de linha inválida", {
            file,
            entryType: typeof entry,
          })
        );
      }

      const [lineIndex, currentLine] = entry;

      const parsedLine = sanitizeLine(currentLine, state);
      if (!isSanitizeResult(parsedLine)) {
        throw toError(
          createSafeError("Retorno inválido de sanitizeLine", {
            file,
            lineIndex,
          })
        );
      }

      if (!isParseState(parsedLine.newState)) {
        throw toError(
          createSafeError("Estado inválido retornado por sanitizeLine", {
            file,
            lineIndex,
          })
        );
      }

      state = parsedLine.newState;

      if (pattern.test(parsedLine.sanitizedLine)) {
        const rel = file.replace(rootDir + "\\", "").replace(/\\/g, "/");
        const outputLine = lineIndex + 1;
        process.stdout.write(`${rel}:${outputLine}: ${currentLine.trim()}\n`);
        total++;
      }
      pattern.lastIndex = 0; // reset after test()
    }
  }

  process.stdout.write(`\nTotal de ocorrências de 'any': ${total}\n`);

  if (strict && total > 0) {
    return 1;
  }

  return 0;
}

try {
  const code = await main();
  process.exit(code);
} catch (error) {
  const safeError = normalizeError(error, { script: "scripts/check-any.mjs" });
  logSafeError(safeError);
  process.exit(1);
}
