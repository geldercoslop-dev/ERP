/**
 * Main Entry Point - Production & Development
 *
 * ## Production Startup:
 * ```bash
 * pnpm run build                # Compile TypeScript to JavaScript
 * NODE_ENV=production pnpm run start  # Run pre-compiled code
 * # Or directly: node dist/server/index.js
 * ```
 *
 * ## Development Startup:
 * ```bash
 * pnpm run dev   # Hot-reload with tsx (JIT compiler)
 * ```
 *
 * ## Production Safety:
 * - NO tsx/JIT compilation allowed in production
 * - All code MUST be pre-compiled to JavaScript
 * - Environment variables validated before startup
 * - Fail-fast on invalid configuration
 */
console.log("[BOOT] entry: server/index.ts");
// ============================================================================
// PRODUCTION SAFETY CHECK (Fail-Fast Pattern) 
// ============================================================================
/**
 * Critical: Prevent tsx JIT compiler in production
 * tsx is development-only. Production must use pre-compiled Node.js
 */
function validateProductionRuntime() {
    const isProduction = process.env.NODE_ENV === "production";
    // Detect if running under tsx runtime
    const isTsx = (process.argv[1]?.includes("tsx") ||
        process.argv[0]?.includes("tsx") ||
        process.isTsx === true ||
        process.env.TSX_DEV === "true");
    if (isProduction && isTsx) {
        console.error("");
        console.error("╔══════════════════════════════════════════════════════════════════╗");
        console.error("║            ❌ FATAL ERROR: Invalid Runtime (Production)           ║");
        console.error("║        Cannot execute tsx/JIT compiler in production!            ║");
        console.error("╚══════════════════════════════════════════════════════════════════╝");
        console.error("");
        console.error("📍 Current Setup: NODE_ENV=production + tsx runtime");
        console.error("");
        console.error("❌ Problem:");
        console.error("   - tsx is a JIT TypeScript compiler for development");
        console.error("   - Production MUST use pre-compiled JavaScript");
        console.error("   - This is a critical security & performance requirement");
        console.error("");
        console.error("✅ Correct Production Procedure:");
        console.error("");
        console.error("   1. Build once (compile TypeScript → JavaScript):");
        console.error('      $ pnpm run build');
        console.error("");
        console.error("   2. Start with Node.js (run pre-compiled code):");
        console.error('      $ NODE_ENV=production pnpm run start');
        console.error("      # Equivalent to: node dist/server/index.js");
        console.error("");
        console.error("✅ Development (tsx allowed with hot-reload):");
        console.error('      $ pnpm run dev');
        console.error("");
        console.error("📚 For setup instructions, see:");
        console.error("   - ENV_SETUP_CHECKLIST.md");
        console.error("   - ENVIRONMENT_VALIDATION_IMPLEMENTATION_REPORT.md");
        console.error("");
        process.exit(1);
    }
}
// Validate runtime BEFORE any other imports
validateProductionRuntime();
// ============================================================================
// Import Core Application
// ============================================================================
// Load service protection layer first
import "./_core/init-protection.js";
// Start main application
import "./_core/index.js";
console.log('PORTA REAL:', process.env.PORT);
