/**
 * Em produção/test: encerra o processo. Em development: apenas loga (processo continua).
 */
export function exitProcessInProductionUnlessDevelopment(code = 1) {
    if (process.env.NODE_ENV !== "development") {
        process.exit(code);
    }
    console.error("❌ ERRO CAPTURADO EM DEV - NÃO ENCERRANDO");
    console.log("🔥 SERVER STILL RUNNING AFTER ERROR");
}
