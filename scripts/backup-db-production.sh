#!/bin/bash

# Backup Diário do ERP - Produção
# Uso: ./scripts/backup-db-production.sh

set -e

# Configurações
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="erp_backup_${TIMESTAMP}.sql"
RETENTION_DAYS=30

# Criar diretório de backup
mkdir -p "$BACKUP_DIR"

echo "🔄 Iniciando backup do banco de dados..."
echo "📅 Data/Hora: $(date)"
echo "📁 Arquivo: $BACKUP_FILE"

# Backup do banco
mysqldump \
  --host="$DATABASE_HOST" \
  --port="$DATABASE_PORT" \
  --user="$DATABASE_USER" \
  --password="$DATABASE_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --quick \
  --lock-tables=false \
  "$DATABASE_NAME" > "$BACKUP_DIR/$BACKUP_FILE"

# Comprimir backup
gzip "$BACKUP_DIR/$BACKUP_FILE"

echo "✅ Backup concluído: $BACKUP_FILE.gz"

# Limpar backups antigos
find "$BACKUP_DIR" -name "erp_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "🧹 Limpeza de backups antigos concluída"

# Verificar tamanho
BACKUP_SIZE=$(du -h "$BACKUP_DIR/${BACKUP_FILE}.gz" | cut -f1)
echo "📊 Tamanho do backup: $BACKUP_SIZE"

echo "🎉 Backup finalizado com sucesso!"
