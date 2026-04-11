export type ParseState = {
  inBlockComment: boolean;
  inTemplateLiteral: boolean;
};

export type SanitizeResult = {
  sanitizedLine: string;
  newState: ParseState;
};

export type ValidationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
      context?: Record<string, unknown>;
    };

function failure<T>(error: string, context?: Record<string, unknown>): ValidationResult<T> {
  return { ok: false, error, context };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function assertIsString(
  value: unknown,
  label: string
): ValidationResult<string> {
  if (typeof value !== "string") {
    return failure("Valor deve ser string", {
      label,
      receivedType: typeof value,
    });
  }

  return { ok: true, data: value };
}

export function assertIsParseState(value: unknown): ValidationResult<ParseState> {
  if (!isRecord(value)) {
    return failure("ParseState deve ser objeto não-nulo", {
      receivedType: typeof value,
    });
  }

  if (typeof value.inBlockComment !== "boolean") {
    return failure("ParseState.inBlockComment inválido", {
      receivedType: typeof value.inBlockComment,
    });
  }

  if (typeof value.inTemplateLiteral !== "boolean") {
    return failure("ParseState.inTemplateLiteral inválido", {
      receivedType: typeof value.inTemplateLiteral,
    });
  }

  return {
    ok: true,
    data: {
      inBlockComment: value.inBlockComment,
      inTemplateLiteral: value.inTemplateLiteral,
    },
  };
}

export function assertIsSanitizeResult(
  value: unknown
): ValidationResult<SanitizeResult> {
  if (!isRecord(value)) {
    return failure("SanitizeResult deve ser objeto não-nulo", {
      receivedType: typeof value,
    });
  }

  if (typeof value.sanitizedLine !== "string") {
    return failure("SanitizeResult.sanitizedLine inválido", {
      receivedType: typeof value.sanitizedLine,
    });
  }

  const stateValidation = assertIsParseState(value.newState);
  if (!stateValidation.ok) {
    return failure("SanitizeResult.newState inválido", {
      reason: stateValidation.error,
      ...(stateValidation.context ?? {}),
    });
  }

  return {
    ok: true,
    data: {
      sanitizedLine: value.sanitizedLine,
      newState: stateValidation.data,
    },
  };
}
