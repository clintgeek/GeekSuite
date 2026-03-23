#!/usr/bin/env node
const migration = require('./migrations/1731197000000_enhance-chords-with-memory-hooks.js');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function runMigration() {
  const client = await pool.connect();
  const output = [];

  try {
    output.push('Running enhanced chord lessons migration...\n');
    await migration.up(client);
    output.push('✅ Migration completed successfully!');
  } catch (error) {
    output.push(`❌ Migration failed: ${error.message}`);
    output.push(error.stack);
  } finally {
    client.release();
    await pool.end();

    const result = output.join('\n');
    fs.writeFileSync('MIGRATION_RUN_RESULT.txt', result);
    console.log(result);
  }
}

runMigration();
