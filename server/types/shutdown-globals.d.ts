/**
 * Pool MySQL e cliente Redis expostos para graceful shutdown explícito.
 * Preenchidos em `config/database.ts` e `infra/redis.ts`.
 */
export {};

declare global {
  /** Pool mysql2/promise — `getConnectionPool()` atribui após criar o pool. */
  var db: import("mysql2/promise").Pool | undefined;
  /** Cliente Redis (ioredis) — atribuído após `connect()` bem-sucedido. */
  var redis:
    | {
        quit: () => Promise<unknown>;
      }
    | undefined;
}
