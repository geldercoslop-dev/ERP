/**
 * Main Entry Point - Production & Development
 * 
 * ## Production Startup:
 * ```bash
 * pnpm run build                # Compile TypeScript
 * NODE_ENV=production pnpm run start  # Start with node
 * # Or directly: node dist/server/index.js
 * ```
 * 
 * ## Development Startup:
 * ```bash
 * pnpm run dev   # Hot-reload with tsx
 * ```
 *
 * ## Production Safety:
 * - NO tsx/JIT compilation in production
 * - All code must be pre-compiled to JavaScript
 * - Environment variables validated at startup
 */

// ============================================================================
// PRODUCTION SAFETY CHECK (Fail-Fast Pattern)
// ============================================================================

/**
 * Prevent accidental tsx execution in production
 * tsx is only for development - production must use pre-compiled Node.js
 */
function validateRuntime(): void {
  const isProduction = process.env.NODE_ENV === "production";
  
  // Detect if running under tsx
  const isTsx = (
    process.argv[1]?.includes("tsx") ||
    process.argv[0]?.includes("tsx") ||
    (process as any).isTsx === true ||
    process.env.TSX_DEV === "true"
  );

  if (isProduction && isTsx) {
    console.error("");
    console.error("╔══════════════════════════════════════════════════════════════════╗");
    console.error("║                 ❌ FATAL ERROR: Invalid Runtime                   ║");
    console.error("║       Cannot execute tsx/JIT compiler in production!             ║");
    console.error("╚══════════════════════════════════════════════════════════════════╝");
    console.error("");
    console.error("📍 Current Setup: NODE_ENV=production + tsx");
    console.error("");
    console.error("❌ Problem:");
    console.error("   - tsx is a JIT TypeScript compiler (development-only)");
    console.error("   - Production MUST use pre-compiled JavaScript");
    console.error("   - This is a security & performance requirement");
    console.error("");
    console.error("✅ Correct Production Procedure:");
    console.error("");
    console.error("   1. Build once:");
    console.error('      $ pnpm run build');
    console.error("");
    console.error("   2. Start with Node.js:");
    console.error('      $ NODE_ENV=production pnpm run start');
    console.error("      # Equivalent to: node dist/server/index.js");
    console.error("");
    console.error("✅ Development (tsx allowed):");
    console.error('      $ pnpm run dev');
    console.error("");
    console.error("📚 Learn more:");
    console.error("   - ENV_SETUP_CHECKLIST.md (Development + Production setup)");
    console.error("   - ENVIRONMENT_VALIDATION_IMPLEMENTATION_REPORT.md");
    console.error("");
    process.exit(1);
  }
}

// Validate runtime BEFORE any other imports
validateRuntime();

// ============================================================================
// Import Core Application
// ============================================================================

// Load service protection layer
import "./_core/init-protection";

// Start main application
import "./_core/index";
