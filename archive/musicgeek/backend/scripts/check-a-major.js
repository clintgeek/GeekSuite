const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '192.168.1.17',
  port: 55432,
  database: 'guitargeek',
  user: 'datageek_pg_admin',
  password: 'REDACTED',
});

async function checkAMajor() {
  const client = await pool.connect();
  const output = [];

  try {
    const result = await client.query(`
      SELECT step_number, instruction
      FROM lesson_steps
      WHERE lesson_id = (SELECT id FROM lessons WHERE title = 'Your First Chord: A Major')
      ORDER BY step_number
    `);

    output.push('=== A MAJOR CHORD - ALL STEPS ===\n');
    result.rows.forEach((row) => {
      output.push(`\nSTEP ${row.step_number}:\n${row.instruction}\n`);
      output.push('---');
    });
  } catch (error) {
    output.push(`ERROR: ${error.message}`);
  } finally {
    client.release();
    await pool.end();
  }

  const result = output.join('\n');
  fs.writeFileSync('A_MAJOR_FULL.txt', result);
  console.log(result);
}

checkAMajor();
