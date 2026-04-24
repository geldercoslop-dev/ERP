import { parseEnv } from "./env.schema.js";
/** Fail-fast: lança erro se ENV crítico estiver inválido. */
export function validateRequiredEnv() {
    try {
        void parseEnv();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ENV_FATAL] ${message}`);
        process.exit(1);
    }
}
