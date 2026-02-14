#!/bin/sh

# Configuration
BACKUP_DIR="/backups"
MONGO_HOST="mongo"
MONGO_PORT="27017"
MONGO_USER="${MONGO_INITDB_ROOT_USERNAME}"
MONGO_PASS="${MONGO_INITDB_ROOT_PASSWORD}"
DB_NAME="notegeek"
DAYS_TO_KEEP=7

# Create timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="notegeek_backup_${TIMESTAMP}.gz"

# Ensure backup directory exists
mkdir -p ${BACKUP_DIR}

# Perform backup
mongodump \
    --host=${MONGO_HOST} \
    --port=${MONGO_PORT} \
    --username=${MONGO_USER} \
    --password=${MONGO_PASS} \
    --authenticationDatabase=admin \
    --db=${DB_NAME} \
    --archive=${BACKUP_DIR}/${BACKUP_NAME} \
    --gzip

# Clean up old backups (older than DAYS_TO_KEEP days)
find ${BACKUP_DIR} -name "notegeek_backup_*.gz" -type f -mtime +${DAYS_TO_KEEP} -delete

# Optional: Copy to Nextcloud sync path if specified
if [ ! -z "${NEXTCLOUD_BACKUP_PATH}" ]; then
    cp ${BACKUP_DIR}/${BACKUP_NAME} ${NEXTCLOUD_BACKUP_PATH}/
fi