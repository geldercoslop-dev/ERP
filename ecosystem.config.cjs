const path = require("path");

module.exports = {
  apps: [
    {
      name: "erp-backend",
      script: "dist/server/_core/index.js",
      cwd: path.resolve(__dirname),
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3004",
        APP_SECRET: process.env.APP_SECRET || "pm2-local-secret",
      },
      error_file: "./logs/pm2-erp-error.log",
      out_file: "./logs/pm2-erp-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
