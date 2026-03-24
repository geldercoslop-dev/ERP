/**
 * Geração de RequestId único para rastreamento
 */

let requestCounter = 0;

export function generateRequestId(): string {
  const timestamp = Date.now();
  const counter = ++requestCounter;
  const random = Math.random().toString(36).substring(2, 8);
  return `req-${timestamp}-${counter}-${random}`;
}

export function isValidRequestId(id: string): boolean {
  return /^req-\d+-\d+-[a-z0-9]+$/.test(id);
}
