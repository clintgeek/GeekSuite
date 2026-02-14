#!/bin/bash

# MongoDB connection details
MONGO_USER="ngeek_usr_f8z3k9b1"
MONGO_PASS="NotePass_ngk_7Hq-pLm5sRzYtW2_K"
MONGO_HOST="localhost:27017"
SOURCE_DB="notegeek_dev"
TARGET_DB="notegeek"

# Create a temporary directory for the dump
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: ${TEMP_DIR}"

# Dump the source database
echo "Dumping ${SOURCE_DB} database..."
docker exec -it notegeek-mongo mongodump \
  --uri="mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}/${SOURCE_DB}?authSource=admin" \
  --out="${TEMP_DIR}"

# Restore to target database
echo "Restoring to ${TARGET_DB} database..."
docker exec -it notegeek-mongo mongorestore \
  --uri="mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}/${TARGET_DB}?authSource=admin" \
  --drop \
  "${TEMP_DIR}/${SOURCE_DB}"

# Verify the migration
echo "Verifying migration..."
docker exec -it notegeek-mongo mongosh "mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}/admin?authSource=admin" --quiet <<EOF
const sourceDB = db.getSiblingDB('${SOURCE_DB}');
const targetDB = db.getSiblingDB('${TARGET_DB}');

const collections = sourceDB.getCollectionNames();
collections.forEach(collection => {
    const sourceCount = sourceDB[collection].countDocuments();
    const targetCount = targetDB[collection].countDocuments();
    print(\`\${collection}: Source=\${sourceCount}, Target=\${targetCount}\`);
});
EOF

# Clean up
echo "Cleaning up..."
rm -rf "${TEMP_DIR}"

echo "Migration complete!"