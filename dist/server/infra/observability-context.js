import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage();
export function runWithObservabilityContext(context, operation) {
    return storage.run(context, operation);
}
export function getObservabilityContext() {
    return storage.getStore();
}
