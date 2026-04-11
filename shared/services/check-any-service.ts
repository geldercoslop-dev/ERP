import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  createInitialState,
  createProcessingResult,
  type ProcessingResult,
  sanitizeLine,
  splitLines,
  countAnyOccurrences,
} from "../core/check-any-core.js";
import { logMessage } from "../utils/logger.js";
import { safeExecute } from "../utils/safe-execute.js";

export type ProcessFileOptions = {
  rootDir: string;
};

export type ProcessFileOutput = ProcessingResult & {
  matches: string[];
};

function readFileStage(filePath: string): string | null {
  return safeExecute(
    () => readFileSync(filePath, "utf8"),
    {
      stage: "readFile",
      filePath,
    }
  );
}

function splitLinesStage(content: string, filePath: string): string[] | null {
  const result = safeExecute(() => splitLines(content), {
    stage: "splitLines",
    filePath,
  });

  if (result === null) {
    return null;
  }

  if (!result.ok) {
    logMessage("error", result.error, {
      ...(result.context ?? {}),
      stage: "splitLines",
      filePath,
    });
    return null;
  }

  return result.data;
}

function sanitizeStage(
  line: string,
  state: ReturnType<typeof createInitialState>,
  filePath: string,
  lineIndex: number
): ReturnType<typeof sanitizeLine> | null {
  const result = safeExecute(() => sanitizeLine(line, state), {
    stage: "sanitize",
    filePath,
    lineIndex,
  });

  if (result === null) {
    return null;
  }

  return result;
}

function toRelativePath(rootDir: string, filePath: string): string {
  const normalizedRoot = `${rootDir}\\`;
  return filePath.replace(normalizedRoot, "").replace(/\\/g, "/");
}

export function processFile(filePath: string, options: ProcessFileOptions): ProcessFileOutput {
  const result: ProcessFileOutput = {
    ...createProcessingResult(),
    matches: [],
  };

  const content = readFileStage(filePath);
  if (content === null) {
    result.errors += 1;
    return result;
  }

  const lines = splitLinesStage(content, filePath);
  if (lines === null) {
    result.errors += 1;
    return result;
  }

  let state = createInitialState();

  for (const [lineIndex, line] of lines.entries()) {
    const sanitizeResult = sanitizeStage(line, state, filePath, lineIndex);
    if (sanitizeResult === null) {
      result.errors += 1;
      continue;
    }

    if (!sanitizeResult.ok) {
      result.errors += 1;
      logMessage("error", sanitizeResult.error, {
        ...(sanitizeResult.context ?? {}),
        filePath,
        lineIndex,
      });
      continue;
    }

    state = sanitizeResult.data.newState;
    const occurrence = countAnyOccurrences(sanitizeResult.data.sanitizedLine);
    if (occurrence > 0) {
      const relativePath = toRelativePath(options.rootDir, filePath);
      result.total += occurrence;
      result.matches.push(`${relativePath}:${lineIndex + 1}: ${line.trim()}`);
    }
  }

  return result;
}

export function walkTypeScriptFiles(rootPath: string): string[] {
  const discovered: string[] = [];

  const entries = safeExecute(
    () => readdirSync(rootPath, { withFileTypes: true }),
    { stage: "walk", rootPath }
  );

  if (entries === null) {
    return discovered;
  }

  for (const entry of entries) {
    const fullPath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      discovered.push(...walkTypeScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && extname(entry.name) === ".ts") {
      discovered.push(fullPath);
    }
  }

  return discovered;
}

export function runRobustnessSimulation(rootDir: string): ProcessingResult {
  const result = createProcessingResult();

  const empty = processFile(join(rootDir, "__empty__.ts"), { rootDir });
  if (empty.errors === 0 && empty.total === 0) {
    result.warnings += 1;
  }

  const giantFileContent = `${"const a: any = 1;\n".repeat(5000)}const b = 2;`;
  const giantLines = splitLines(giantFileContent);
  if (giantLines.ok) {
    let state = createInitialState();
    for (const [lineIndex, line] of giantLines.data.entries()) {
      const sanitized = sanitizeLine(line, state);
      if (!sanitized.ok) {
        result.errors += 1;
        continue;
      }
      state = sanitized.data.newState;
      result.total += countAnyOccurrences(sanitized.data.sanitizedLine);
      if (lineIndex < 0) {
        result.warnings += 1;
      }
    }
  } else {
    result.errors += 1;
  }

  const invalidLine = sanitizeLine(undefined, createInitialState());
  if (!invalidLine.ok) {
    result.errors += 1;
  }

  const invalidState = sanitizeLine("const x = 1", {
    inBlockComment: "invalid",
    inTemplateLiteral: false,
  });
  if (!invalidState.ok) {
    result.errors += 1;
  }

  return result;
}
