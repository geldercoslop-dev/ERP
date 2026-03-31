/**
 * PM2 — produção (executar a partir do repositório).
 * Uso: pm2 start deployment/ecosystem.config.js
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  apps: [
    {
      name: 'erp-server',
      script: 'dist/server/index.js',
      cwd: path.resolve(__dirname, '..'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/erp-error.log',
      out_file: './logs/erp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};

export default config;
