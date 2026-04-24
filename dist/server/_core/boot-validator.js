import { systemLogger } from './logger.js';
import { validateBootDatabaseConnection } from '../services/boot-validation.service.js';
import { parseEnv } from '../services/env.schema.js';
/**
 * Validador de boot do sistema
 * Implementa fail-fast se componentes críticos falharem
 */
export class BootValidator {
    checks = [];
    errors = [];
    warnings = [];
    /**
     * Executa todas as validações de boot
     */
    async validateBoot() {
        systemLogger.info({ message: 'Starting boot validation' });
        const startTime = Date.now();
        try {
            // 1. Validar variáveis de ambiente críticas
            await this.validateEnvironment();
            // 2. Validar conexão com banco de dados (crítico)
            await this.validateDatabase();
            // 3. Validar sistema de arquivos
            await this.validateFileSystem();
            // 4. Validar configurações de segurança
            await this.validateSecurity();
            // 5. Validar serviços externos (se houver)
            await this.validateExternalServices();
            const duration = Date.now() - startTime;
            const success = this.errors.length === 0;
            systemLogger.info({
                success,
                duration,
                checksCount: this.checks.length,
                errorsCount: this.errors.length,
                warningsCount: this.warnings.length
            }, 'Boot validation completed');
            return {
                success,
                checks: this.checks,
                errors: this.errors,
                warnings: this.warnings
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            systemLogger.error({
                error: errorMessage,
                duration,
                checksCount: this.checks.length,
                errorsCount: this.errors.length
            }, 'Boot validation failed with exception');
            this.errors.push(`Boot validation exception: ${errorMessage}`);
            return {
                success: false,
                checks: this.checks,
                errors: this.errors,
                warnings: this.warnings
            };
        }
    }
    /**
     * Valida variáveis de ambiente críticas
     */
    async validateEnvironment() {
        const startTime = Date.now();
        const requiredEnvVars = [
            'DATABASE_URL',
            'NODE_ENV',
            'JWT_ACCESS_SECRET',
            'JWT_REFRESH_SECRET'
        ];
        const missingVars = [];
        const optionalVars = ['PORT', 'REDIS_URL'];
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                missingVars.push(envVar);
            }
        }
        if (missingVars.length > 0) {
            this.errors.push(`Missing required environment variables: ${missingVars.join(', ')}`);
            this.checks.push({
                name: 'Environment Variables',
                status: 'fail',
                duration: Date.now() - startTime,
                message: `Missing: ${missingVars.join(', ')}`,
                details: { missing: missingVars, required: requiredEnvVars }
            });
        }
        else {
            this.checks.push({
                name: 'Environment Variables',
                status: 'pass',
                duration: Date.now() - startTime,
                message: 'All required environment variables present'
            });
            // Verificar variáveis opcionais
            const missingOptional = optionalVars.filter(v => !process.env[v]);
            if (missingOptional.length > 0) {
                this.warnings.push(`Missing optional environment variables: ${missingOptional.join(', ')}`);
            }
        }
    }
    /**
     * Valida conexão com banco de dados (crítico)
     */
    async validateDatabase() {
        const startTime = Date.now();
        try {
            const diagnostics = await validateBootDatabaseConnection();
            this.warnings.push(...diagnostics.warnings);
            const missingTables = diagnostics.missingTables;
            if (missingTables.length > 0) {
                this.warnings.push(`Missing critical tables: ${missingTables.join(', ')}`);
            }
            this.checks.push({
                name: 'Database Connection',
                status: 'pass',
                duration: Date.now() - startTime,
                message: 'Database connection successful',
                details: {
                    missingTables: missingTables.length > 0 ? missingTables : undefined
                }
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const errorCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
            console.error('DB ERROR COMPLETE:', {
                message: errorMessage,
                stack: errorStack,
                code: errorCode,
                config: {
                    host: process.env.DB_HOST || process.env.DATABASE_HOST,
                    port: process.env.DB_PORT || process.env.DATABASE_PORT,
                    user: process.env.DB_USER || process.env.DATABASE_USER,
                    database: process.env.DB_NAME || process.env.DATABASE_NAME,
                    ssl: process.env.DATABASE_SSL
                }
            });
            this.errors.push(`Database connection failed: ${errorMessage}`);
            this.checks.push({
                name: 'Database Connection',
                status: 'fail',
                duration: Date.now() - startTime,
                message: errorMessage,
                details: { error: errorMessage, code: errorCode }
            });
        }
    }
    /**
     * Valida sistema de arquivos
     */
    async validateFileSystem() {
        const startTime = Date.now();
        const fs = await import('fs/promises');
        const path = await import('path');
        const requiredDirs = [
            'logs',
            'uploads',
            'temp'
        ];
        const missingDirs = [];
        for (const dir of requiredDirs) {
            try {
                await fs.access(path.join(process.cwd(), dir));
            }
            catch (error) {
                try {
                    await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
                    this.warnings.push(`Created missing directory: ${dir}`);
                }
                catch (mkdirError) {
                    missingDirs.push(dir);
                }
            }
        }
        if (missingDirs.length > 0) {
            this.errors.push(`Cannot create required directories: ${missingDirs.join(', ')}`);
            this.checks.push({
                name: 'File System',
                status: 'fail',
                duration: Date.now() - startTime,
                message: `Missing directories: ${missingDirs.join(', ')}`,
                details: { missing: missingDirs }
            });
        }
        else {
            this.checks.push({
                name: 'File System',
                status: 'pass',
                duration: Date.now() - startTime,
                message: 'All required directories accessible'
            });
        }
    }
    /**
     * Valida configurações de segurança
     */
    async validateSecurity() {
        const startTime = Date.now();
        // Verificar segredos JWT
        const { JWT_ACCESS_SECRET: jwtAccessSecret, JWT_REFRESH_SECRET: jwtRefreshSecret } = parseEnv();
        if (!jwtAccessSecret || jwtAccessSecret === 'default-access-secret') {
            this.warnings.push('Using default JWT access secret - set JWT_ACCESS_SECRET in production');
        }
        if (!jwtRefreshSecret || jwtRefreshSecret === 'default-refresh-secret') {
            this.warnings.push('Using default JWT refresh secret - set JWT_REFRESH_SECRET in production');
        }
        if (jwtAccessSecret === jwtRefreshSecret) {
            this.errors.push('JWT access and refresh secrets must be different');
        }
        // Verificar NODE_ENV
        const nodeEnv = process.env.NODE_ENV;
        if (nodeEnv === 'development') {
            this.warnings.push('Running in development mode');
        }
        else if (!['production', 'staging'].includes(nodeEnv || '')) {
            this.warnings.push(`Unknown NODE_ENV: ${nodeEnv}`);
        }
        const hasErrors = this.errors.some(e => e.includes('JWT'));
        this.checks.push({
            name: 'Security Configuration',
            status: hasErrors ? 'fail' : 'warn',
            duration: Date.now() - startTime,
            message: hasErrors ? 'Security configuration issues found' : 'Security configuration OK with warnings'
        });
    }
    /**
     * Valida serviços externos (placeholder para futuras implementações)
     */
    async validateExternalServices() {
        const startTime = Date.now();
        // Placeholder para validação de Redis, S3, etc.
        const { REDIS_URL: redisUrl } = parseEnv();
        if (redisUrl) {
            // TODO: Implementar validação Redis
            this.warnings.push('Redis URL configured but validation not implemented');
        }
        this.checks.push({
            name: 'External Services',
            status: 'pass',
            duration: Date.now() - startTime,
            message: 'No external services configured'
        });
    }
    /**
     * Gera relatório detalhado do boot
     */
    generateReport() {
        const lines = [];
        lines.push('='.repeat(60));
        lines.push('BOOT VALIDATION REPORT');
        lines.push('='.repeat(60));
        lines.push(`Status: ${this.errors.length === 0 ? 'PASS' : 'FAIL'}`);
        lines.push(`Checks: ${this.checks.length}`);
        lines.push(`Errors: ${this.errors.length}`);
        lines.push(`Warnings: ${this.warnings.length}`);
        lines.push('');
        if (this.checks.length > 0) {
            lines.push('CHECKS:');
            for (const check of this.checks) {
                const statusIcon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
                lines.push(`  ${statusIcon} ${check.name} (${check.duration}ms) - ${check.message}`);
            }
            lines.push('');
        }
        if (this.errors.length > 0) {
            lines.push('ERRORS:');
            for (const error of this.errors) {
                lines.push(`  ✗ ${error}`);
            }
            lines.push('');
        }
        if (this.warnings.length > 0) {
            lines.push('WARNINGS:');
            for (const warning of this.warnings) {
                lines.push(`  ⚠ ${warning}`);
            }
            lines.push('');
        }
        lines.push('='.repeat(60));
        return lines.join('\n');
    }
}
