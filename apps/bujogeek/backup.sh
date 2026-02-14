#!/bin/bash

# Get current date for backup filename
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
BACKUP_FILE="$BACKUP_DIR/bujogeek_backup_$DATE"

# MongoDB connection details from environment variables
MONGO_USER=$MONGO_INITDB_ROOT_USERNAME
MONGO_PASS=$MONGO_INITDB_ROOT_PASSWORD
MONGO_HOST="mongo"
MONGO_PORT="27017"

# Create backup
echo "Creating MongoDB backup..."
mongodump --host $MONGO_HOST:$MONGO_PORT \
          --username $MONGO_USER \
          --password $MONGO_PASS \
          --authenticationDatabase admin \
          --out $BACKUP_FILE

# Compress backup
echo "Compressing backup..."
tar -czf "$BACKUP_FILE.tar.gz" -C $BACKUP_DIR "bujogeek_backup_$DATE"
rm -rf $BACKUP_FILE

# Keep only last 7 backups
echo "Cleaning up old backups..."
ls -t $BACKUP_DIR/*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup completed: $BACKUP_FILE.tar.gz"