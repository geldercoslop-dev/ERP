import { getConnectionPool, getPoolStats, requireDatabaseUrl } from '../config/database.js';
import { systemLogger } from './logger.js';
import * as mysql from 'mysql2/promise';
import { parseEnv } from '../services/env.schema.js';
/**
 * Validador de boot do sistema - VERSÃO CORRIGIDA
 * Implementa fail-fast REAL sem retry para validação de boot
 */
export class BootValidatorFixed {
    checks = [];
    errors = [];
    warnings = [];
    /**
     * Executa todas as validações de boot
     */
    async validateBoot() {
        systemLogger.info({ message: 'Starting boot validation (FAIL-FAST VERSION)' });
        const startTime = Date.now();
        try {
            // 1. Validar variáveis de ambiente críticas
            await this.validateEnvironment();
            // 2. Validar conexão com banco de dados (FAIL-FAST REAL - sem retry)
            await this.validateDatabaseFailFast();
            // 3. Validar sistema de arquivos
            await this.validateFileSystem();
            // 4. Validar configurações de segurança
            await this.validateSecurity();
            // 5. Validar serviços externos
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
        }
    }
    /**
     * Valida conexão com banco de dados - FAIL-FAST REAL
     * USA conexão direta sem retry para garantir fail-fast
     */
    async validateDatabaseFailFast() {
        const startTime = Date.now();
        try {
            const url = requireDatabaseUrl();
            const testConnection = await mysql.createConnection(url);
            await testConnection.execute('SELECT 1 as test');
            await testConnection.end();
            this.checks.push({
                name: 'Database Connection (FAIL-FAST)',
                status: 'pass',
                duration: Date.now() - startTime,
                message: 'Database connection successful (direct test)'
            });
            try {
                const pool = await getConnectionPool();
                const conn = await pool.getConnection();
                await conn.query('SELECT 1 AS pool_test');
                conn.release();
                const stats = await getPoolStats();
                this.checks.push({
                    name: 'Database Pool',
                    status: 'pass',
                    duration: Date.now() - startTime,
                    message: 'Connection pool (getConnectionPool) healthy',
                    details: stats,
                });
            }
            catch (poolError) {
                this.errors.push(`Pool initialization failed: ${poolError instanceof Error ? poolError.message : String(poolError)}`);
                this.checks.push({
                    name: 'Database Pool',
                    status: 'fail',
                    duration: Date.now() - startTime,
                    message: 'Pool failed',
                    details: { error: poolError instanceof Error ? poolError.message : String(poolError) }
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.errors.push(`Database connection failed: ${errorMessage}`);
            this.checks.push({
                name: 'Database Connection (FAIL-FAST)',
                status: 'fail',
                duration: Date.now() - startTime,
                message: errorMessage,
                details: { error: errorMessage }
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
        const requiredDirs = ['logs', 'uploads', 'temp'];
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
        const { JWT_ACCESS_SECRET: jwtAccessSecret, JWT_REFRESH_SECRET: jwtRefreshSecret } = parseEnv();
        if (jwtAccessSecret && jwtRefreshSecret && jwtAccessSecret === jwtRefreshSecret) {
            this.errors.push('JWT access and refresh secrets must be different');
        }
        const hasErrors = this.errors.some((e) => e.includes('JWT'));
        this.checks.push({
            name: 'Security Configuration',
            status: hasErrors ? 'fail' : 'pass',
            duration: Date.now() - startTime,
            message: hasErrors ? 'Security configuration issues found' : 'Security configuration OK',
        });
    }
    /**
     * Valida serviços externos
     */
    async validateExternalServices() {
        const startTime = Date.now();
        const { REDIS_URL: redisUrl } = parseEnv();
        if (redisUrl) {
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
        lines.push('BOOT VALIDATION REPORT (FAIL-FAST VERSION)');
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
