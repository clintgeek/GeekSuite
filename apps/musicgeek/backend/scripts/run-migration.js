const { Pool } = require('pg');
const migration = require('../migrations/1731200000000_enhance-remaining-lessons');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'CHANGE_ME',
});

async function runMigration() {
  const client = await pool.connect();

  try {
    await migration.up(client);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
