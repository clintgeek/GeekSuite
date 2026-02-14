const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function fixDuplicate() {
  const client = await pool.connect();
  const log = [];

  try {
    log.push('Fixing duplicate step 10...\n');

    await client.query('BEGIN');

    // Delete the duplicate step 10
    log.push('Deleting duplicate step 10...');
    await client.query(`
      DELETE FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number = 10
      AND instruction LIKE 'The Classic Pattern%'
    `);

    // Shift steps 11-12 down to 10-11
    log.push('Shifting steps 11-12 down to 10-11...');
    await client.query(`
      UPDATE lesson_steps
      SET step_number = step_number - 1
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      AND step_number > 10
    `);

    await client.query('COMMIT');
    log.push('✅ Fixed!\n');

    // Verify
    const result = await client.query(`
      SELECT step_number, LEFT(instruction, 70) as inst
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Strumming 101: Your First Strumming Pattern')
      ORDER BY step_number
    `);

    log.push('Final steps:');
    result.rows.forEach((row) => log.push(`  Step ${row.step_number}: ${row.inst}...`));

    const output = log.join('\n');
    fs.writeFileSync('FIX_DUPLICATE_RESULT.txt', output);
    console.log(output);
  } catch (error) {
    await client.query('ROLLBACK');
    log.push(`ERROR: ${error.message}`);
    const output = log.join('\n');
    fs.writeFileSync('FIX_DUPLICATE_RESULT.txt', output);
    console.log(output);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixDuplicate();
