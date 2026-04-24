/**
 * LEO Desktop Automation - Stub Implementation
 *
 * Implementação mínima para ERP Core + LEO Básico
 * Automação desktop desativada temporariamente para reduzir erros de compilação
 */
export class DesktopAutomation {
    isEnabled = false;
    constructor() {
        console.log("[LEO Desktop Automation STUB] Initialized in stub mode");
    }
    async captureScreen() {
        console.log("[LEO Desktop Automation STUB] captureScreen called");
        return Buffer.from("stub-image-data");
    }
    async captureRegion(x, y, width, height) {
        console.log(`[LEO Desktop Automation STUB] captureRegion called: ${x},${y} ${width}x${height}`);
        return Buffer.from("stub-region-data");
    }
    async getScreenSize() {
        console.log("[LEO Desktop Automation STUB] getScreenSize called");
        return { width: 1920, height: 1080 };
    }
    async moveMouse(position) {
        console.log(`[LEO Desktop Automation STUB] moveMouse to: ${position.x},${position.y}`);
    }
    async click(position) {
        console.log(`[LEO Desktop Automation STUB] click at: ${position?.x || 'current'},${position?.y || 'current'}`);
    }
    async typeText(text) {
        console.log(`[LEO Desktop Automation STUB] typeText: "${text}"`);
    }
    async pressKey(key) {
        console.log(`[LEO Desktop Automation STUB] pressKey: "${key}"`);
    }
    isAvailable() {
        return this.isEnabled;
    }
    enable() {
        this.isEnabled = true;
        console.log("[LEO Desktop Automation STUB] Enabled (stub mode)");
    }
    disable() {
        this.isEnabled = false;
        console.log("[LEO Desktop Automation STUB] Disabled");
    }
}
export const desktopAutomation = new DesktopAutomation();
export default desktopAutomation;
