import { RUNTIME } from "../config/runtime.js";
import { createLogger } from "../infra/structured-logger.js";
import { attachShutdownHttpServer, getShutdownBootCompleteFlag, getShutdownConnectionStats, isShutdownInProgress, markShutdownBootComplete, registerProcessShutdownHandlers, requestShutdown, } from "../services/system/shutdown.service.js";
const logger = createLogger("graceful-shutdown");
export { markShutdownBootComplete, isShutdownInProgress, };
export class GracefulShutdown {
    setup(server, options = {}) {
        attachShutdownHttpServer(server, options);
        registerProcessShutdownHandlers();
        const signalsLogged = !RUNTIME.isDev && process.env.ENABLE_SIGUSR2_SHUTDOWN === "1"
            ? ["SIGTERM", "SIGINT", "SIGUSR2"]
            : ["SIGTERM", "SIGINT"];
        logger.info("Graceful shutdown module ready", {
            metadata: {
                timeoutMs: options.timeoutMs ?? 30_000,
                signals: [...signalsLogged],
                enableGracefulShutdown: RUNTIME.enableGracefulShutdown,
                bootComplete: getShutdownBootCompleteFlag(),
            },
        });
    }
    async shutdown(signal) {
        await requestShutdown({ reason: signal, code: 0 });
    }
    isShutting() {
        return isShutdownInProgress();
    }
    getConnectionStats() {
        return getShutdownConnectionStats();
    }
}
export const gracefulShutdown = new GracefulShutdown();
export function shutdownCheckMiddleware() {
    return (req, res, next) => {
        if (gracefulShutdown.isShutting()) {
            res.status(503).json({
                error: "Service Unavailable",
                message: "Server is shutting down",
                retryAfter: 60,
            });
            return;
        }
        next();
    };
}
export function setupGracefulShutdown(server, options) {
    gracefulShutdown.setup(server, options);
    return [shutdownCheckMiddleware()];
}
export default gracefulShutdown;
