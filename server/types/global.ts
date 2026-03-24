/**
 * Payload genérico JSON-safe para jobs, eventos e integrações (evitar any em mapas dinâmicos).
 */
export type Payload = Record<string, unknown>;
