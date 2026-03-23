const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    // Create pgmigrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS pgmigrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_on TIMESTAMP NOT NULL
      )
    `);

    // Get list of already run migrations
    const { rows: completedMigrations } = await client.query(
      'SELECT name FROM pgmigrations ORDER BY name'
    );
    const completedNames = new Set(completedMigrations.map((m) => m.name));

    // Get all migration files
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.js'))
      .sort();

    console.log(`Found ${files.length} migration files`);
    console.log(`Already completed: ${completedNames.size} migrations\n`);

    let ranCount = 0;
    for (const file of files) {
      const migrationName = file.replace('.js', '');

      if (completedNames.has(migrationName)) {
        console.log(`⏭️  Skipping ${migrationName} (already run)`);
        continue;
      }

      console.log(`🔄 Running ${migrationName}...`);
      const migration = require(path.join(migrationsDir, file));

      try {
        await migration.up(client);
        await client.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())', [
          migrationName,
        ]);
        console.log(`✅ Completed ${migrationName}\n`);
        ranCount++;
      } catch (error) {
        console.error(`❌ Failed ${migrationName}:`, error.message);
        throw error;
      }
    }

    if (ranCount === 0) {
      console.log('✅ All migrations up to date!');
    } else {
      console.log(`\n✅ Successfully ran ${ranCount} new migration(s)`);
    }
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
