export function asRecord(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    return null;
}
export function asArray(value) {
    return Array.isArray(value) ? value : [];
}
export function getString(record, key) {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}
export function getNumber(record, key) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function getBoolean(record, key) {
    const value = record[key];
    return typeof value === 'boolean' ? value : undefined;
}
export function getRecord(record, key) {
    return asRecord(record[key]);
}
export function getUnknownArray(record, key) {
    return asArray(record[key]);
}
export function getStringArray(record, key) {
    return asArray(record[key]).filter((item) => typeof item === 'string');
}
export function toErrorMessage(error) {
    return error instanceof Error ? error.message : 'Erro desconhecido';
}
