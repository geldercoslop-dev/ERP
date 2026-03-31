/**
 * Script de limpeza automática do sistema.
 * Remove logs antigos (> 30 dias) e mantém apenas os últimos 30 backups.
 */
export declare function runCleanup(): Promise<{
    logsRemoved: number;
    backupsRemoved: number;
    spaceFreedBytes: number;
}>;
