export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type FileInput = {
  path: string;
  content: string;
};

export type ProcessOutput = {
  total: number;
  errors: number;
};

export type ProcessedFile = ProcessOutput & {
  matches: string[];
};

export type ParserState =
  | { type: "normal" }
  | { type: "in_string"; quote: "'" | '"' | "`"; escaped: boolean }
  | { type: "in_comment"; mode: "line" | "block" };

type SanitizeLineOutput = {
  sanitized: string;
  state: ParserState;
};

type SnapshotCase = {
  name: string;
  input: FileInput;
  expected: ProcessOutput;
};

type SnapshotReport = {
  passed: number;
  failed: number;
  details: string[];
};

type LineAccumulator = {
  sanitized: string;
  state: ParserState;
  stopLine: boolean;
};

type ProcessAccumulator = {
  state: ParserState;
  total: number;
  errors: number;
  matches: string[];
};

const NORMAL_STATE: ParserState = { type: "normal" };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateFileInput(input: unknown): Result<FileInput> {
  if (!isRecord(input)) {
    return fail("FileInput deve ser objeto");
  }

  if (typeof input.path !== "string" || input.path.length === 0) {
    return fail("FileInput.path inválido");
  }

  if (typeof input.content !== "string") {
    return fail("FileInput.content inválido");
  }

  return ok({ path: input.path, content: input.content });
}

function splitLines(content: string): string[] {
  return content.split("\n");
}

function countAnyTokens(line: string): number {
  return line.split(/\bany\b/g).length > 1 ? 1 : 0;
}

function nextState(currentState: ParserState, char: string, nextChar: string): ParserState {
  if (currentState.type === "in_comment") {
    if (currentState.mode === "line") {
      return currentState;
    }

    if (char === "*" && nextChar === "/") {
      return { type: "normal" };
    }

    return currentState;
  }

  if (currentState.type === "in_string") {
    if (currentState.escaped) {
      return { ...currentState, escaped: false };
    }

    if (char === "\\") {
      return { ...currentState, escaped: true };
    }

    if (char === currentState.quote) {
      return { type: "normal" };
    }

    return currentState;
  }

  if (char === "/" && nextChar === "/") {
    return { type: "in_comment", mode: "line" };
  }

  if (char === "/" && nextChar === "*") {
    return { type: "in_comment", mode: "block" };
  }

  if (char === "'" || char === '"' || char === "`") {
    return { type: "in_string", quote: char, escaped: false };
  }

  return currentState;
}

function shouldKeepChar(state: ParserState): boolean {
  return state.type === "normal";
}

function isLineCommentStart(state: ParserState, char: string, nextChar: string): boolean {
  return state.type === "normal" && char === "/" && nextChar === "/";
}

function shouldSkipPair(state: ParserState, char: string, nextChar: string): boolean {
  const startsBlockComment = state.type === "normal" && char === "/" && nextChar === "*";
  const endsBlockComment =
    state.type === "in_comment" && state.mode === "block" && char === "*" && nextChar === "/";
  return startsBlockComment || endsBlockComment;
}

function reduceChar(chars: string[], acc: LineAccumulator, char: string, index: number): LineAccumulator {
  if (acc.stopLine) {
    return acc;
  }

  const nextChar = chars[index + 1] ?? "";
  const next = nextState(acc.state, char, nextChar);
  if (isLineCommentStart(acc.state, char, nextChar)) {
    return { ...acc, stopLine: true, state: next };
  }

  const appendChar = shouldKeepChar(acc.state) && !shouldSkipPair(acc.state, char, nextChar);
  return {
    sanitized: appendChar ? `${acc.sanitized}${char}` : acc.sanitized,
    state: next,
    stopLine: false,
  };
}

function normalizeLineState(state: ParserState): ParserState {
  return state.type === "in_comment" && state.mode === "line" ? NORMAL_STATE : state;
}

function sanitizeLine(line: string, state: ParserState): Result<SanitizeLineOutput> {
  const chars = [...line];

  const initial: LineAccumulator = { sanitized: "", state, stopLine: false };
  const reduced = chars.reduce((acc, char, index) => reduceChar(chars, acc, char, index), initial);

  return ok({
    sanitized: reduced.sanitized,
    state: normalizeLineState(reduced.state),
  });
}

function parseLine(line: string, state: ParserState): Result<SanitizeLineOutput> {
  return sanitizeLine(line, state);
}

function buildMatch(path: string, lineIndex: number, line: string): string {
  return `${path}:${lineIndex + 1}: ${line.trim()}`;
}

function reduceLines(filePath: string, lines: string[]): Result<ProcessedFile> {
  const initial: ProcessAccumulator = {
    state: NORMAL_STATE,
    total: 0,
    errors: 0,
    matches: [],
  };

  const reduced = lines.reduce((acc, line, lineIndex) => {
    const parsed = parseLine(line, acc.state);
    if (!parsed.ok) {
      return { ...acc, errors: acc.errors + 1 };
    }

    const found = countAnyTokens(parsed.data.sanitized);
    const nextMatches =
      found > 0 ? [...acc.matches, buildMatch(filePath, lineIndex, line)] : acc.matches;

    return {
      state: parsed.data.state,
      total: acc.total + found,
      errors: acc.errors,
      matches: nextMatches,
    };
  }, initial);

  return ok({
    total: reduced.total,
    errors: reduced.errors,
    matches: reduced.matches,
  });
}

export function processFile(input: FileInput): Result<ProcessedFile> {
  const validated = validateFileInput(input);
  if (!validated.ok) {
    return fail(validated.error);
  }

  const lines = splitLines(validated.data.content);
  return reduceLines(validated.data.path, lines);
}

function snapshotCases(): SnapshotCase[] {
  return [
    {
      name: "arquivo-pequeno",
      input: {
        path: "small.ts",
        content: "const x: any = 1;\nconst y = 2;",
      },
      expected: { total: 1, errors: 0 },
    },
    {
      name: "arquivo-medio",
      input: {
        path: "medium.ts",
        content: "const a = 'any';\nconst b: any = 2;\n// any",
      },
      expected: { total: 1, errors: 0 },
    },
    {
      name: "edge-cases",
      input: {
        path: "edge.ts",
        content: "/* any */\nconst z = `any`;\nconst ok = true;",
      },
      expected: { total: 0, errors: 0 },
    },
  ];
}

function evaluateSnapshot(snapshot: SnapshotCase): Result<string | null> {
  const output = processFile(snapshot.input);
  if (!output.ok) {
    return ok(`${snapshot.name}: ${output.error}`);
  }

  const sameTotal = output.data.total === snapshot.expected.total;
  const sameErrors = output.data.errors === snapshot.expected.errors;
  if (sameTotal && sameErrors) {
    return ok(null);
  }

  return ok(
    `${snapshot.name}: esperado total=${snapshot.expected.total} errors=${snapshot.expected.errors}, obtido total=${output.data.total} errors=${output.data.errors}`
  );
}

function reduceSnapshots(acc: SnapshotReport, snapshot: SnapshotCase): SnapshotReport {
  const evaluated = evaluateSnapshot(snapshot);
  if (!evaluated.ok) {
    return {
      passed: acc.passed,
      failed: acc.failed + 1,
      details: [...acc.details, evaluated.error],
    };
  }

  if (evaluated.data === null) {
    return {
      passed: acc.passed + 1,
      failed: acc.failed,
      details: acc.details,
    };
  }

  return {
    passed: acc.passed,
    failed: acc.failed + 1,
    details: [...acc.details, evaluated.data],
  };
}

export function runSnapshots(): Result<SnapshotReport> {
  const report = snapshotCases().reduce(reduceSnapshots, {
    passed: 0,
    failed: 0,
    details: [],
  });
  return ok(report);
}
