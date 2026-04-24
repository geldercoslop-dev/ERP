import { logInfo } from '../../_core/logger.js';
function hasEnabledFlag(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return typeof candidate.enabled === 'boolean';
}
export const DEFAULT_DESKTOP_CONFIG = {
    robotjs: {
        enabled: false, // Requires manual installation
        mouseSpeed: 10,
        keyDelay: 100,
        screenResolution: {
            width: 1920,
            height: 1080
        }
    },
    playwright: {
        enabled: false, // Requires manual installation
        headless: true,
        browser: 'chromium',
        viewport: {
            width: 1920,
            height: 1080
        },
        timeout: 30000
    },
    nutjs: {
        enabled: false, // Requires manual installation
        screenSize: {
            width: 1920,
            height: 1080
        },
        confidence: 0.95,
        matchTimeout: 10000
    },
    automation: {
        maxExecutionTime: 60000, // 1 minute
        allowFileOperations: true,
        allowSystemCommands: false,
        allowedCommands: ['echo', 'dir', 'ls', 'pwd', 'whoami'],
        blockedCommands: ['rm', 'del', 'format', 'shutdown', 'reboot'],
        workingDirectory: process.cwd()
    }
};
/**
 * Desktop Automation Manager
 *
 * Central configuration and availability checker for desktop automation libraries
 */
export class DesktopAutomationManager {
    static instance;
    config;
    availableLibraries = new Set();
    constructor() {
        this.config = { ...DEFAULT_DESKTOP_CONFIG };
        this.checkAvailableLibraries();
    }
    static getInstance() {
        if (!DesktopAutomationManager.instance) {
            DesktopAutomationManager.instance = new DesktopAutomationManager();
        }
        return DesktopAutomationManager.instance;
    }
    /**
     * Check which automation libraries are available
     */
    async checkAvailableLibraries() {
        const libraries = [
            { name: 'robotjs', module: 'robotjs' },
            { name: 'playwright', module: 'playwright' },
            { name: 'nutjs', module: '@nut-tree/nut-js' }
        ];
        for (const lib of libraries) {
            try {
                require.resolve(lib.module);
                this.availableLibraries.add(lib.name);
                const libConfig = this.config[lib.name];
                if (hasEnabledFlag(libConfig)) {
                    libConfig.enabled = true;
                }
                logInfo(`Desktop automation library available: ${lib.name}`, {
                    extra: { entity: 'DesktopAutomationManager', acao: 'checkLibrary', library: lib.name }
                });
            }
            catch (error) {
                logInfo(`Desktop automation library not found: ${lib.name}`, {
                    extra: { entity: 'DesktopAutomationManager', acao: 'checkLibrary', library: lib.name, status: 'not_available' }
                });
            }
        }
    }
    /**
     * Check if a specific library is available
     */
    isLibraryAvailable(library) {
        return this.availableLibraries.has(library);
    }
    /**
     * Get list of available libraries
     */
    getAvailableLibraries() {
        return Array.from(this.availableLibraries);
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logInfo('Desktop automation configuration updated', {
            extra: { entity: 'DesktopAutomationManager', acao: 'updateConfig' }
        });
    }
    /**
     * Enable/disable specific library
     */
    setLibraryEnabled(library, enabled) {
        if (library in this.config) {
            const configRecord = this.config;
            const libConfig = configRecord[library];
            if (hasEnabledFlag(libConfig)) {
                libConfig.enabled = enabled;
            }
            logInfo(`Library ${library} ${enabled ? 'enabled' : 'disabled'}`, {
                extra: { entity: 'DesktopAutomationManager', acao: 'setLibraryEnabled', library, enabled }
            });
        }
    }
    /**
     * Check if command is allowed
     */
    isCommandAllowed(command) {
        const { allowedCommands, blockedCommands } = this.config.automation;
        // Check if command is explicitly blocked
        if (blockedCommands.some(blocked => command.toLowerCase().includes(blocked.toLowerCase()))) {
            return false;
        }
        // Check if command is explicitly allowed
        if (allowedCommands.length > 0) {
            return allowedCommands.some(allowed => command.toLowerCase().startsWith(allowed.toLowerCase()));
        }
        // If no allowed commands specified, allow by default (except blocked ones)
        return true;
    }
    /**
     * Get installation instructions for missing libraries
     */
    getInstallationInstructions() {
        return {
            robotjs: 'npm install robotjs\nNote: Requires Python and build tools',
            playwright: 'npm install playwright\nnpx playwright install',
            'nutjs': 'npm install @nut-tree/nut-js\nNote: Requires OpenCV for image recognition'
        };
    }
    /**
     * Validate automation settings
     */
    validateSettings() {
        const errors = [];
        // Check screen resolution
        if (this.config.robotjs.screenResolution.width <= 0 ||
            this.config.robotjs.screenResolution.height <= 0) {
            errors.push('Invalid screen resolution in RobotJS config');
        }
        // Check timeouts
        if (this.config.automation.maxExecutionTime <= 0) {
            errors.push('Max execution time must be positive');
        }
        if (this.config.playwright.timeout <= 0) {
            errors.push('Playwright timeout must be positive');
        }
        // Check confidence values
        if (this.config.nutjs.confidence < 0 || this.config.nutjs.confidence > 1) {
            errors.push('Nut.js confidence must be between 0 and 1');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    /**
     * Get status summary
     */
    getStatus() {
        const availableLibraries = this.getAvailableLibraries();
        const enabledLibraries = Object.entries(this.config)
            .filter(([_key, value]) => hasEnabledFlag(value) && value.enabled)
            .map(([key]) => key);
        const validation = this.validateSettings();
        const recommendations = [];
        if (availableLibraries.length === 0) {
            recommendations.push('Install at least one desktop automation library');
        }
        if (!this.config.robotjs.enabled && !this.config.playwright.enabled) {
            recommendations.push('Enable RobotJS for basic desktop control or Playwright for browser automation');
        }
        if (!this.config.automation.allowFileOperations) {
            recommendations.push('Consider enabling file operations for full automation capabilities');
        }
        return {
            availableLibraries,
            enabledLibraries,
            configValid: validation.valid,
            recommendations
        };
    }
}
// Export singleton instance
export const desktopAutomationManager = DesktopAutomationManager.getInstance();
