/**
 * Em produção NUNCA use db:push. Use migrations (db:generate + db:migrate) e backup.
 */
console.error(`
============================================
  PRODUÇÃO: não execute db:push.
============================================
- Faça backup do banco (mysqldump / phpMyAdmin).
- Altere drizzle/schema.ts conforme necessário.
- Gere migração: npm run db:generate
- Revise os SQL em drizzle/migrations.
- Aplique: npm run db:migrate
- Confira /api/health (schemaVersion).
============================================
`);
process.exit(1);
