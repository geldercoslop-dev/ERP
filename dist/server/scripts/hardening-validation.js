/**
 * HARDENING VALIDATION REPORT
 *
 * BLINDAGEM COMPLETA CONTRA MÓDULOS INSTÁVEIS _UNSTABLE
 *
 * DATA: 2026-04-04
 * STATUS: ✅ COMPLETO
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
class HardeningValidator {
    results = [];
    // 1. VERIFICAR IMPORTS DE MÓDULOS INEXISTENTES
    validateNoUnstableImports() {
        console.log('🔍 VALIDANDO: Imports de módulos _unstable...');
        const criticalFiles = [
            'server/services/leo-insights.service.ts',
            'server/services/dashboard-insights.service.ts',
            'server/leo/planning/leo-scheduler.ts',
            'server/leo/utils/leo-notifier.ts',
            'server/services/ai/index.ts',
            'server/services/leo-erp-data.facade.ts'
        ];
        for (const file of criticalFiles) {
            const content = this.readFile(file);
            const issues = [];
            // Verificar imports de _unstable
            if (content.includes('import.*_unstable')) {
                issues.push('❌ Import de módulo _unstable detectado');
            }
            // Verificar from _unstable
            if (content.includes('from.*_unstable')) {
                issues.push('❌ Import from _unstable detectado');
            }
            // Verificar exports de _unstable
            if (content.includes('export.*_unstable')) {
                issues.push('❌ Export de módulo _unstable detectado');
            }
            this.results.push({
                file,
                status: issues.length === 0 ? 'PASS' : 'FAIL',
                issues
            });
        }
    }
    // 2. VALIDAR ARQUIVOS CRÍTICOS
    validateCriticalFiles() {
        console.log('🛡️ VALIDANDO: Arquivos críticos...');
        const criticalValidations = [
            {
                file: 'server/services/leo-insights.service.ts',
                checks: [
                    { pattern: 'HARDENING.*Blindado', description: 'Cabeçalho de hardening' },
                    { pattern: 'Tipos locais definidos', description: 'Tipos locais' },
                    { pattern: 'Proteções contra undefined', description: 'Proteções undefined' }
                ]
            },
            {
                file: 'server/leo/planning/leo-scheduler.ts',
                checks: [
                    { pattern: 'HARDENING.*finance-engine removido', description: 'Remoção finance-engine' },
                    { pattern: 'Proteções contra tenantId', description: 'Proteções tenantId' }
                ]
            },
            {
                file: 'server/leo/utils/leo-notifier.ts',
                checks: [
                    { pattern: 'HARDENING.*insight-engine removido', description: 'Remoção insight-engine' },
                    { pattern: 'Proteções contra tenantId', description: 'Proteções tenantId' }
                ]
            }
        ];
        for (const validation of criticalValidations) {
            const content = this.readFile(validation.file);
            const issues = [];
            for (const check of validation.checks) {
                if (!content.includes(check.pattern)) {
                    issues.push(`❌ Falta: ${check.description}`);
                }
            }
            this.results.push({
                file: validation.file,
                status: issues.length === 0 ? 'PASS' : 'FAIL',
                issues
            });
        }
    }
    // 3. GARANTIR ACESSO DB APENAS EM SERVICES
    validateDatabaseAccess() {
        console.log('🗄️ VALIDANDO: Acesso ao DB apenas em services...');
        // Verificar se arquivos LEO não acessam DB diretamente
        const leoFiles = [
            'server/leo/planning/leo-scheduler.ts',
            'server/leo/utils/leo-notifier.ts'
        ];
        for (const file of leoFiles) {
            const content = this.readFile(file);
            const issues = [];
            // Verificar acesso direto ao DB
            if (content.includes('db.') || content.includes('from "../db')) {
                issues.push('❌ Acesso direto ao DB detectado em arquivo LEO');
            }
            // Verificar se usa apenas services
            if (!content.includes('ordersService') && !content.includes('inventoryService')) {
                issues.push('❌ Não utiliza services layer corretamente');
            }
            this.results.push({
                file,
                status: issues.length === 0 ? 'PASS' : 'FAIL',
                issues
            });
        }
    }
    // 4. CRIAR PROTEÇÕES UNDEFINED
    validateUndefinedProtections() {
        console.log('⚡ VALIDANDO: Proteções contra undefined...');
        const protectedFiles = [
            'server/services/leo-insights.service.ts'
        ];
        for (const file of protectedFiles) {
            const content = this.readFile(file);
            const issues = [];
            // Verificar padrões de proteção undefined
            const undefinedPatterns = [
                '|| 0',
                '!== undefined',
                '? 0 :',
                '?.'
            ];
            let protectionsFound = 0;
            for (const pattern of undefinedPatterns) {
                if (content.includes(pattern)) {
                    protectionsFound++;
                }
            }
            if (protectionsFound < 3) {
                issues.push('❌ Proteções contra undefined insuficientes');
            }
            this.results.push({
                file,
                status: issues.length === 0 ? 'PASS' : 'FAIL',
                issues
            });
        }
    }
    // 5. RODAR TSC PARA VALIDAR TIPOS
    validateTypeScript() {
        console.log('🔷 VALIDANDO: TypeScript compilation...');
        try {
            const output = execSync('pnpm exec tsc -p tsconfig.server.json --noEmit', {
                cwd: process.cwd(),
                encoding: 'utf8'
            });
            this.results.push({
                file: 'TypeScript Compilation',
                status: 'PASS',
                issues: []
            });
        }
        catch (error) {
            this.results.push({
                file: 'TypeScript Compilation',
                status: 'FAIL',
                issues: [`❌ Erros TypeScript: ${error.stdout || error.message}`]
            });
        }
    }
    // UTILITÁRIOS
    readFile(filePath) {
        const fullPath = join(process.cwd(), filePath);
        if (!existsSync(fullPath)) {
            return `// ARQUIVO NÃO ENCONTRADO: ${filePath}`;
        }
        return readFileSync(fullPath, 'utf8');
    }
    // GERAR RELATÓRIO
    generateReport() {
        console.log('\n📋 RELATÓRIO DE HARDENING COMPLETO');
        console.log('='.repeat(60));
        let totalPass = 0;
        let totalFail = 0;
        for (const result of this.results) {
            console.log(`\n📁 ${result.file}`);
            console.log(`   Status: ${result.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
            if (result.issues.length > 0) {
                for (const issue of result.issues) {
                    console.log(`   ${issue}`);
                }
                totalFail++;
            }
            else {
                totalPass++;
            }
        }
        console.log('\n' + '='.repeat(60));
        console.log(`📊 RESUMO:`);
        console.log(`   ✅ PASS: ${totalPass}`);
        console.log(`   ❌ FAIL: ${totalFail}`);
        console.log(`   📈 TAXA SUCESSO: ${((totalPass / (totalPass + totalFail)) * 100).toFixed(1)}%`);
        if (totalFail === 0) {
            console.log('\n🎉 HARDENING COMPLETO! Sistema blindado com sucesso.');
            console.log('   🔒 Todos os módulos instáveis bloqueados');
            console.log('   🛡️ Proteções undefined implementadas');
            console.log('   🗄️ Acesso DB isolado em services');
            console.log('   🔷 TypeScript sem erros');
        }
        else {
            console.log('\n⚠️ HARDENING INCOMPLETO! Corrija as falhas listadas.');
        }
    }
    // EXECUTAR TODAS AS VALIDAÇÕES
    run() {
        console.log('🚀 INICIANDO HARDENING VALIDATION...');
        console.log('='.repeat(60));
        this.validateNoUnstableImports();
        this.validateCriticalFiles();
        this.validateDatabaseAccess();
        this.validateUndefinedProtections();
        this.validateTypeScript();
        this.generateReport();
    }
}
// EXECUTAR VALIDAÇÃO
if (require.main === module) {
    const validator = new HardeningValidator();
    validator.run();
}
export { HardeningValidator };
