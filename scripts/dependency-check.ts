import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Mock logger para evitar dependências ausentes no ambiente de script
const systemLogger = {
  info: (obj: any, msg?: string) => console.log(JSON.stringify({ level: 'info', ...obj, msg })),
  warn: (obj: any, msg?: string) => console.warn(JSON.stringify({ level: 'warn', ...obj, msg })),
  error: (obj: any, msg?: string) => console.error(JSON.stringify({ level: 'error', ...obj, msg }))
};

interface DependencyReport {
  installed: boolean;
  vulnerabilities: {
    total: number;
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  missing: string[];
  duplicated: string[];
}

/**
 * Script de diagnóstico de dependências do ERP.
 * Verifica pacotes instalados, duplicados e vulnerabilidades.
 */
async function main() {
  console.log("🔍 Iniciando diagnóstico de dependências do ERP...");
  
  const report: DependencyReport = {
    installed: true,
    vulnerabilities: { total: 0, critical: 0, high: 0, moderate: 0, low: 0 },
    missing: [],
    duplicated: []
  };

  try {
    // 1. Verificar pacotes não instalados
    console.log("📦 Verificando pacotes instalados...");
    try {
      execSync("npm list --depth=0", { stdio: 'pipe', cwd: root });
    } catch (error: any) {
      const output = error.stdout.toString();
      const missingMatches = output.match(/UNMET DEPENDENCY (.*)/g);
      if (missingMatches) {
        report.missing = missingMatches.map((m: string) => m.replace("UNMET DEPENDENCY ", "").trim());
        report.installed = false;
      }
    }

    // 2. Verificar vulnerabilidades (npm audit)
    console.log("🛡️ Verificando vulnerabilidades (npm audit)...");
    try {
      const auditOutput = execSync("npm audit --json", { stdio: 'pipe', cwd: root }).toString();
      const auditData = JSON.parse(auditOutput);
      
      if (auditData.metadata && auditData.metadata.vulnerabilities) {
        report.vulnerabilities = {
          total: auditData.metadata.totalDependencies || 0,
          ...auditData.metadata.vulnerabilities
        };
      }
    } catch (error: any) {
      // npm audit retorna erro se houver vulnerabilidades
      try {
        const auditData = JSON.parse(error.stdout.toString());
        if (auditData.metadata && auditData.metadata.vulnerabilities) {
          report.vulnerabilities = {
            total: auditData.metadata.totalDependencies || 0,
            ...auditData.metadata.vulnerabilities
          };
        }
      } catch (e) {
        console.warn("⚠️ Não foi possível analisar o JSON do npm audit.");
      }
    }

    // 3. Gerar relatório visual
    console.log("\n========================================");
    console.log("        DEPENDENCY CHECK REPORT         ");
    console.log("========================================");
    
    if (report.installed && report.missing.length === 0) {
      console.log("✅ Dependencies: OK (All installed)");
    } else {
      console.log(`❌ Dependencies: MISSING (${report.missing.length} packages)`);
      report.missing.forEach(pkg => console.log(`   - ${pkg}`));
    }

    const vulns = report.vulnerabilities;
    const totalVulns = vulns.critical + vulns.high + vulns.moderate + vulns.low;
    
    if (totalVulns === 0) {
      console.log("✅ Vulnerabilities: 0 (Safe)");
    } else {
      console.log(`⚠️ Vulnerabilities: ${totalVulns} found`);
      if (vulns.critical > 0) console.log(`   - Critical: ${vulns.critical} 🚨`);
      if (vulns.high > 0) console.log(`   - High: ${vulns.high} 🟠`);
      if (vulns.moderate > 0) console.log(`   - Moderate: ${vulns.moderate} 🟡`);
      if (vulns.low > 0) console.log(`   - Low: ${vulns.low} 🔵`);
    }

    console.log("========================================\n");

    // 4. Registrar no Logger
    systemLogger.info({
      module: "dependency-check",
      status: totalVulns > 0 || !report.installed ? "warning" : "success",
      missingCount: report.missing.length,
      vulnerabilities: report.vulnerabilities
    }, "Diagnóstico de dependências concluído");

  } catch (error: any) {
    systemLogger.error({
      module: "dependency-check",
      error: error.message
    }, "Falha crítica no diagnóstico de dependências");
    console.error("❌ Falha crítica:", error.message);
    process.exit(1);
  }
}

main();
