import { logInfo, logError } from '../../_core/logger.js';
import { LeoPermissionError } from '../errors/leo-error.js';
export const MODE_PERMISSIONS = {
    SAFE: {
        operateErp: false,
        readData: true,
        writeData: false,
        deleteData: false,
        controlDesktop: false,
        executeScripts: false,
        manipulateFiles: false,
        manageSystem: false,
        viewLogs: true,
        restartServices: false,
        financialOperations: false,
        approvePayments: false,
        processRefunds: false,
        runAnalysis: true,
        generateReports: true,
        makeRecommendations: true
    },
    ASSIST: {
        operateErp: true,
        readData: true,
        writeData: true,
        deleteData: false,
        controlDesktop: false,
        executeScripts: false,
        manipulateFiles: true,
        manageSystem: false,
        viewLogs: true,
        restartServices: false,
        financialOperations: false,
        approvePayments: false,
        processRefunds: false,
        runAnalysis: true,
        generateReports: true,
        makeRecommendations: true
    },
    OPERATOR: {
        operateErp: true,
        readData: true,
        writeData: true,
        deleteData: true,
        controlDesktop: true,
        executeScripts: true,
        manipulateFiles: true,
        manageSystem: true,
        viewLogs: true,
        restartServices: true,
        financialOperations: true,
        approvePayments: false,
        processRefunds: false,
        runAnalysis: true,
        generateReports: true,
        makeRecommendations: true
    },
    AUTONOMOUS: {
        operateErp: true,
        readData: true,
        writeData: true,
        deleteData: true,
        controlDesktop: true,
        executeScripts: true,
        manipulateFiles: true,
        manageSystem: true,
        viewLogs: true,
        restartServices: true,
        financialOperations: true,
        approvePayments: true,
        processRefunds: true,
        runAnalysis: true,
        generateReports: true,
        makeRecommendations: true
    }
};
export class LeoOperatorMode {
    currentMode = 'OPERATOR';
    context = null;
    sessionStartTime = new Date();
    constructor() {
        this.initializeMode();
    }
    initializeMode() {
        const envMode = process.env.LEO_MODE;
        if (envMode && Object.keys(MODE_PERMISSIONS).includes(envMode)) {
            this.currentMode = envMode;
        }
        logInfo(`LEO Operator Mode initialized: ${this.currentMode}`, {
            extra: { entity: 'LeoOperatorMode', acao: 'initializeMode', mode: this.currentMode }
        });
    }
    /**
     * Check if operator mode is active
     */
    isModoOperadorAtivo() {
        return this.currentMode !== 'SAFE';
    }
    /**
     * Activate operator mode
     */
    ativarModoOperador() {
        if (this.currentMode === 'SAFE') {
            const context = {
                sessionId: 'system',
                mode: 'OPERATOR',
                permissions: Object.keys(MODE_PERMISSIONS['OPERATOR']),
                timestamp: new Date()
            };
            this.setMode('OPERATOR', context);
        }
    }
    /**
     * Deactivate operator mode
     */
    desativarModoOperador() {
        const context = {
            sessionId: 'system',
            mode: 'SAFE',
            permissions: Object.keys(MODE_PERMISSIONS['SAFE']),
            timestamp: new Date()
        };
        this.setMode('SAFE', context);
    }
    /**
     * Get configuration
     */
    getConfig() {
        return {
            currentMode: this.currentMode,
            permissions: MODE_PERMISSIONS[this.currentMode],
            sessionStartTime: this.sessionStartTime,
            context: this.context
        };
    }
    /**
     * Set operator mode (requires appropriate permissions)
     */
    setMode(mode, context) {
        // Only allow mode changes from ASSIST or higher
        if (this.currentMode === 'SAFE' && mode !== 'SAFE') {
            throw new LeoPermissionError(`Cannot change mode from SAFE to ${mode}`);
        }
        this.currentMode = mode;
        this.context = context;
        logInfo(`LEO mode changed to: ${mode}`, {
            extra: {
                entity: 'LeoOperatorMode',
                acao: 'setMode',
                newMode: mode,
                userId: context.userId,
                sessionId: context.sessionId
            }
        });
    }
    /**
     * Check if an action is permitted in current mode
     */
    hasPermission(action) {
        const permissions = MODE_PERMISSIONS[this.currentMode];
        return permissions[action] || false;
    }
    /**
     * Require permission for an action or throw error
     */
    requirePermission(action) {
        if (!this.hasPermission(action)) {
            throw new LeoPermissionError(`Action '${action}' not permitted in mode '${this.currentMode}'`);
        }
    }
    /**
     * Check if financial operations require confirmation
     */
    requiresConfirmation(action) {
        const isFinancialAction = [
            'financialOperations',
            'approvePayments',
            'processRefunds'
        ].includes(action);
        // Financial operations require confirmation in OPERATOR mode
        return isFinancialAction && this.currentMode === 'OPERATOR';
    }
    /**
     * Get all permissions for current mode
     */
    getPermissions() {
        return { ...MODE_PERMISSIONS[this.currentMode] };
    }
    /**
     * Get session information
     */
    getSessionInfo() {
        return {
            mode: this.currentMode,
            startTime: this.sessionStartTime,
            duration: Date.now() - this.sessionStartTime.getTime(),
            context: this.context
        };
    }
    /**
     * Execute action with permission checking
     */
    async executeAction(action, actionFn, options = {}) {
        this.requirePermission(action);
        const needsConfirmation = options.requireConfirmation ?? this.requiresConfirmation(action);
        if (needsConfirmation) {
            logInfo(`Action requires confirmation: ${action}`, {
                extra: {
                    entity: 'LeoOperatorMode',
                    acao: 'executeAction',
                    action,
                    mode: this.currentMode,
                    requiresConfirmation: true
                }
            });
            // TODO: Implement confirmation mechanism
            // This would wait for user confirmation before proceeding
        }
        try {
            const result = await actionFn();
            logInfo(`Action executed successfully: ${action}`, {
                extra: {
                    entity: 'LeoOperatorMode',
                    acao: 'executeAction',
                    action,
                    success: true
                }
            });
            return result;
        }
        catch (error) {
            logError(`Action execution failed: ${action}`, {
                extra: {
                    entity: 'LeoOperatorMode',
                    acao: 'executeAction',
                    action,
                    error
                }
            });
            throw error;
        }
    }
    /**
     * Emergency stop - switch to SAFE mode
     */
    emergencyStop() {
        const previousMode = this.currentMode;
        this.currentMode = 'SAFE';
        logError(`Emergency stop activated - mode changed from ${previousMode} to SAFE`, {
            extra: {
                entity: 'LeoOperatorMode',
                acao: 'emergencyStop',
                previousMode,
                newMode: this.currentMode
            }
        });
    }
    /**
     * Validate context for mode operations
     */
    validateContext(context) {
        if (!context.sessionId) {
            return false;
        }
        // Additional validation logic can be added here
        return true;
    }
    /**
     * Get available actions for current mode
     */
    getAvailableActions() {
        const permissions = MODE_PERMISSIONS[this.currentMode];
        return Object.entries(permissions)
            .filter(([_, allowed]) => allowed)
            .map(([action]) => action);
    }
    /**
     * Check if mode can be escalated
     */
    canEscalateTo(targetMode) {
        const modeHierarchy = {
            'SAFE': 0,
            'ASSIST': 1,
            'OPERATOR': 2,
            'AUTONOMOUS': 3
        };
        const currentLevel = modeHierarchy[this.currentMode];
        const targetLevel = modeHierarchy[targetMode];
        return targetLevel <= currentLevel;
    }
}
// Singleton instance
export const leoOperatorMode = new LeoOperatorMode();
