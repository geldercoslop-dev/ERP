/**
 * Tipos centralizados do agente LEO
 * Eventos, memória, automação e ações do agente
 */
// ===== ENUNS PADRONIZADOS =====
export var LeoEventType;
(function (LeoEventType) {
    LeoEventType["COMANDO"] = "comando";
    LeoEventType["PERCEPCAO"] = "percepcao";
    LeoEventType["ACAO"] = "acao";
    LeoEventType["MEMORIA"] = "memoria";
    LeoEventType["ERRO"] = "erro";
})(LeoEventType || (LeoEventType = {}));
export var LeoEventStatus;
(function (LeoEventStatus) {
    LeoEventStatus["ATIVO"] = "ativo";
    LeoEventStatus["RESOLVIDO"] = "resolvido";
    LeoEventStatus["IGNORADO"] = "ignorado";
})(LeoEventStatus || (LeoEventStatus = {}));
export var LeoEventPriority;
(function (LeoEventPriority) {
    LeoEventPriority["BAIXA"] = "baixa";
    LeoEventPriority["MEDIA"] = "media";
    LeoEventPriority["ALTA"] = "alta";
    LeoEventPriority["CRITICA"] = "critica";
})(LeoEventPriority || (LeoEventPriority = {}));
export var LeoMemoryType;
(function (LeoMemoryType) {
    LeoMemoryType["EPISODICA"] = "episodica";
    LeoMemoryType["SEMANTICA"] = "semantica";
    LeoMemoryType["PROCEDURAL"] = "procedural";
    LeoMemoryType["TRABALHO"] = "trabalho";
})(LeoMemoryType || (LeoMemoryType = {}));
export var LeoCommandOrigin;
(function (LeoCommandOrigin) {
    LeoCommandOrigin["USUARIO"] = "usuario";
    LeoCommandOrigin["SISTEMA"] = "sistema";
    LeoCommandOrigin["AUTOMACAO"] = "automacao";
})(LeoCommandOrigin || (LeoCommandOrigin = {}));
export var LeoInsightType;
(function (LeoInsightType) {
    LeoInsightType["PADRAO"] = "padrao";
    LeoInsightType["ANOMALIA"] = "anomalia";
    LeoInsightType["OPORTUNIDADE"] = "oportunidade";
    LeoInsightType["RISCO"] = "risco";
})(LeoInsightType || (LeoInsightType = {}));
export var LeoInsightImpact;
(function (LeoInsightImpact) {
    LeoInsightImpact["BAIXO"] = "baixo";
    LeoInsightImpact["MEDIO"] = "medio";
    LeoInsightImpact["ALTO"] = "alto";
    LeoInsightImpact["CRITICO"] = "critico";
})(LeoInsightImpact || (LeoInsightImpact = {}));
export var LeoTaskType;
(function (LeoTaskType) {
    LeoTaskType["ANALYSIS"] = "analysis";
    LeoTaskType["MONITORING"] = "monitoring";
    LeoTaskType["AUTOMATION"] = "automation";
    LeoTaskType["LEARNING"] = "learning";
    LeoTaskType["CLEANUP"] = "cleanup";
    LeoTaskType["EMERGENCY"] = "emergency";
})(LeoTaskType || (LeoTaskType = {}));
export var LeoTaskPriority;
(function (LeoTaskPriority) {
    LeoTaskPriority["LOW"] = "low";
    LeoTaskPriority["MEDIUM"] = "medium";
    LeoTaskPriority["HIGH"] = "high";
    LeoTaskPriority["CRITICAL"] = "critical";
})(LeoTaskPriority || (LeoTaskPriority = {}));
export var LeoTaskStatus;
(function (LeoTaskStatus) {
    LeoTaskStatus["PENDING"] = "pending";
    LeoTaskStatus["RUNNING"] = "running";
    LeoTaskStatus["DONE"] = "done";
    LeoTaskStatus["ERROR"] = "error";
    LeoTaskStatus["BLOCKED"] = "blocked";
})(LeoTaskStatus || (LeoTaskStatus = {}));
