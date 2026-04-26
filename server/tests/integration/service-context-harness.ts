/**
 * Garante AsyncLocalStorage de serviço em cada hook/teste (Vitest não herda ALS entre tarefas).
 */
import { afterAll, beforeAll, it as vitestIt, type TestOptions } from "vitest";
import { runAsScriptService } from "../../core/service-context.js";
import { bootstrapServer } from "../../_core/bootstrap.js";

let bootstrapInitialized = false;

export function beforeAllWithServiceContext(fn: () => void | Promise<void>): void {
  beforeAll(async () => {
    if (!bootstrapInitialized) {
      await bootstrapServer();
      bootstrapInitialized = true;
    }
    await runAsScriptService(() => Promise.resolve(fn()));
  });
}

export function afterAllWithServiceContext(fn: () => void | Promise<void>): void {
  afterAll(() => runAsScriptService(() => Promise.resolve(fn())));
}

export function itWithServiceContext(
  name: string,
  fn: () => void | Promise<void>,
  options?: TestOptions
): void {
  vitestIt(name, () => runAsScriptService(() => Promise.resolve(fn())), options);
}
