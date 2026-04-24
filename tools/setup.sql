-- ⚠️ SETUP SCRIPT - BOOTSTRAP ONLY
-- Creates database and user (infrastructure, not schema)
-- Safe to run for development setup

CREATE DATABASE IF NOT EXISTS vendas_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'vendas'@'localhost' IDENTIFIED BY 'vendas123';
GRANT ALL PRIVILEGES ON vendas_app.* TO 'vendas'@'localhost';
FLUSH PRIVILEGES;

