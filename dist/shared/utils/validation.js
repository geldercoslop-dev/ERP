function failure(error, context) {
    return { ok: false, error, context };
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
export function assertIsString(value, label) {
    if (typeof value !== "string") {
        return failure("Valor deve ser string", {
            label,
            receivedType: typeof value,
        });
    }
    return { ok: true, data: value };
}
export function assertIsParseState(value) {
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
export function assertIsSanitizeResult(value) {
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
