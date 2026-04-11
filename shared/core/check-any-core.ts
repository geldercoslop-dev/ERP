import {
  type ParseState,
  type SanitizeResult,
  type ValidationResult,
  assertIsParseState,
  assertIsSanitizeResult,
  assertIsString,
} from "../utils/validation.js";

export type ProcessingResult = {
  total: number;
  errors: number;
  warnings: number;
};

export const anyPattern = /\bany\b/g;

export function createInitialState(): ParseState {
  return {
    inBlockComment: false,
    inTemplateLiteral: false,
  };
}

export function splitLines(content: string): ValidationResult<string[]> {
  const validation = assertIsString(content, "file-content");
  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    data: validation.data.split("\n"),
  };
}

export function sanitizeLine(
  line: unknown,
  state: unknown
): ValidationResult<SanitizeResult> {
  const lineValidation = assertIsString(line, "line");
  if (!lineValidation.ok) {
    return lineValidation;
  }

  const stateValidation = assertIsParseState(state);
  if (!stateValidation.ok) {
    return {
      ok: false,
      error: "Estado de parsing inválido",
      context: stateValidation.context,
    };
  }

  const sourceLine = lineValidation.data;
  let newState: ParseState = {
    inBlockComment: stateValidation.data.inBlockComment,
    inTemplateLiteral: stateValidation.data.inTemplateLiteral,
  };

  let result = "";
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (index < sourceLine.length) {
    const ch = sourceLine[index] ?? "";
    const next = sourceLine[index + 1] ?? "";

    if (newState.inBlockComment) {
      if (ch === "*" && next === "/") {
        newState = { ...newState, inBlockComment: false };
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "\\") {
        index += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === "\\") {
        index += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    if (newState.inTemplateLiteral) {
      if (ch === "`") {
        newState = { ...newState, inTemplateLiteral: false };
      }
      index += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      break;
    }

    if (ch === "/" && next === "*") {
      newState = { ...newState, inBlockComment: true };
      index += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    if (ch === "`") {
      newState = { ...newState, inTemplateLiteral: true };
      index += 1;
      continue;
    }

    result += ch;
    index += 1;
  }

  return assertIsSanitizeResult({
    sanitizedLine: result,
    newState,
  });
}

export function countAnyOccurrences(line: string): number {
  anyPattern.lastIndex = 0;
  return anyPattern.test(line) ? 1 : 0;
}

export function createProcessingResult(): ProcessingResult {
  return {
    total: 0,
    errors: 0,
    warnings: 0,
  };
}
