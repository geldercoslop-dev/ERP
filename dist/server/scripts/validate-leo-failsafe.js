import { z } from "zod";
import { toolExecutor } from "../leo/agent/tool-executor.js";
import { toolRegistry } from "../leo/agent/tool-registry.js";
const tenantContext = {
    tenantId: 1,
    userId: 1,
    role: "admin",
    userRole: "admin",
    vendedorId: 1,
    __fromTool: true,
};
let flakyAttempts = 0;
toolRegistry.register({
    name: "failsafe_flaky_tool",
    description: "Tool de teste para retry automático",
    inputSchema: z.object({}),
    handler: async () => {
        flakyAttempts += 1;
        if (flakyAttempts < 3) {
            throw new Error(`Falha simulada ${flakyAttempts}`);
        }
        return { ok: true, attempts: flakyAttempts };
    },
});
toolRegistry.register({
    name: "failsafe_timeout_tool",
    description: "Tool de teste para timeout",
    inputSchema: z.object({}),
    handler: async () => new Promise((resolve) => {
        setTimeout(() => resolve({ ok: true }), 20000);
    }),
});
async function run() {
    console.log("[FAILSAFE] Iniciando teste de retry...");
    const retryResult = await toolExecutor.executeTool("failsafe_flaky_tool", {}, tenantContext);
    console.log("[FAILSAFE] Retry result:", JSON.stringify(retryResult));
    console.log("[FAILSAFE] Iniciando teste de timeout...");
    const timeoutResult = await toolExecutor.executeTool("failsafe_timeout_tool", {}, tenantContext);
    console.log("[FAILSAFE] Timeout result:", JSON.stringify(timeoutResult));
    const retryOk = retryResult.success === true;
    const timeoutOk = timeoutResult.success === false && (timeoutResult.error ?? "").includes("Fallback");
    if (!retryOk || !timeoutOk) {
        throw new Error(`Validação fail-safe falhou. retryOk=${String(retryOk)} timeoutOk=${String(timeoutOk)}`);
    }
    console.log("[FAILSAFE] Validação concluída com sucesso.");
}
run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[FAILSAFE] Erro:", message);
    process.exit(1);
});
