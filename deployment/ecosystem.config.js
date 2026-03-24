/**
 * PM2 — produção (executar a partir do repositório).
 * Uso: pm2 start deployment/ecosystem.config.js
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'erp-server',
      script: 'dist/server/_core/index.js',
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
