/**
 * Fachada legada do ecossistema LEO.
 *
 * Esta camada não expõe mais DB diretamente. Ela apenas orquestra chamadas de
 * services já existentes para manter compatibilidade incremental do ponto de entrada.
 *
 * HARDENING: Bloqueado exports de módulos instáveis _unstable
 * HARDENING: Apenas leo-insights.service.ts é exportado (já blindado)
 */
// HARDENING: Exportação segura - apenas serviços validados e blindados
export { getLeoInsights } from "./ai/leo-insights.service.js";
// HARDENING: Módulos instáveis removidos:
// - sales-analytics.service.js (DELETADO)
// - stock-analytics.service.js (DELETADO) 
// - financial-insights.service.js (DELETADO)
