import os from "os";
import { systemLogger } from "./logger.js";
/**
 * Mantido apenas por compatibilidade.
 * O servidor roda exclusivamente em processo único.
 */
export function setupCluster() {
    systemLogger.info("[CLUSTER] desativado: execução single-process");
    return false;
}
/**
 * Compatibilidade de API: sempre processo principal único.
 */
export function isClusterPrimary() {
    return true;
}
/**
 * Compatibilidade de API: não há workers de cluster.
 */
export function isClusterWorker() {
    return false;
}
/**
 * Compatibilidade de API: sem workers de cluster.
 */
export function getActiveWorkerCount() {
    return 0;
}
/**
 * Informações de execução no modo single-process.
 */
export function getClusterInfo() {
    return {
        isPrimary: true,
        workerId: undefined,
        workerpid: process.pid,
        totalWorkers: 0,
        cpuCount: os.cpus().length,
    };
}
