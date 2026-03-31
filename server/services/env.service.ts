import { parseEnv } from "./env.schema.js";

/** Fail-fast: lança erro se ENV crítico estiver inválido. */
export function validateRequiredEnv(): void {
  void parseEnv();
}

